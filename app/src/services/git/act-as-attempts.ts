import { randomBytes } from "node:crypto"
import type { GitMrApprovalAttempt } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { open, seal } from "@/lib/secret-box"
import { GitStationError, type ApprovalIntent, type BindingIntent, type GitStationActAsClaim, type GitStationClient } from "@/lib/git/gitstation-client"
import { ConflictError, NotFoundError, StatusError } from "@/services/_shared"
import type { ApiErrorCode } from "@/services/_shared/error-codes"

/**
 * The act-as attempts Kanflow keeps for GitStation's confirmation (GitStation ADR-0025 §5), shared by every intent:
 * approve / withdraw a merge request (K4, mr-approvals.service) and bind / unbind a repository (X3,
 * repo-bindings.service). One row of `git_mr_approval_attempt` per press:
 *
 *  - open: a `state` of 256 random bits, sealed, bound to the Kanflow user, the project and what was asked for;
 *  - lock: only the user who started, only an open, unexpired row of the expected intents; a compare-and-set lock
 *    makes a double press claim once;
 *  - claim: everything that can fail is read first, then GitStation's claim is sent ONCE with the state (the
 *    service account itself, no Forge-Act-As). Not pressed yet → the row stays usable; a lost answer → the row
 *    ends (the claim's secret may be spent);
 *  - person: the claim must name (by employee number) the Kanflow user who started, else it is discarded.
 *
 * What the claim must match beyond the person (the merge request and head, or the repository, Kanflow project and
 * setting) is each feature's own check. Never logged: the state, the assertion, the employee number.
 */

const log = logger.child({ module: "git-act-as" })

/** GitStation's confirmation page expires after 10 minutes. */
export const ATTEMPT_TTL_MS = 10 * 60_000
/** A claim in flight blocks a second press for this long (then the row can be claimed again). */
export const CLAIM_LOCK_MS = 30_000
/** Expired rows are removed a day later (on the next start of the same user). */
const PURGE_AFTER_MS = 24 * 60 * 60_000
/** Attempts one user may have open at once (each is a GitStation confirmation). */
const MAX_OPEN_ATTEMPTS = 20

export type ActAsIntent = ApprovalIntent | BindingIntent
export const MR_INTENTS: readonly ActAsIntent[] = ["approve", "unapprove"]
export const BINDING_INTENTS: readonly ActAsIntent[] = ["binding_set", "binding_remove"]

export type AttemptOutcome = "approved" | "withdrawn" | "unchanged" | "bound" | "updated" | "removed" | "discarded" | "failed"
export type ActAsAttempt = GitMrApprovalAttempt

export const statusError = (status: number, code: ApiErrorCode, message: string, extra?: Record<string, unknown>): StatusError => new StatusError(status, message, extra, code)

/** What one attempt is bound to (the columns of its intent; the CHECK refuses any other combination). */
export type AttemptSubject =
  | { intent: ApprovalIntent; gitLinkId: string; headSha: string }
  | { intent: "binding_set"; stationProjectId: number; resolvesWorkItems: boolean; bindingId: number | null }
  | { intent: "binding_remove"; stationProjectId: number; bindingId: number }

function columnsOf(subject: AttemptSubject): { gitLinkId?: string; headSha?: string; stationProjectId?: bigint; resolvesWorkItems?: boolean; bindingId?: bigint | null } {
  switch (subject.intent) {
    case "binding_set":
      return { stationProjectId: BigInt(subject.stationProjectId), resolvesWorkItems: subject.resolvesWorkItems, bindingId: subject.bindingId === null ? null : BigInt(subject.bindingId) }
    case "binding_remove":
      return { stationProjectId: BigInt(subject.stationProjectId), bindingId: BigInt(subject.bindingId) }
    default:
      return { gitLinkId: subject.gitLinkId, headSha: subject.headSha }
  }
}

/** A new attempt and the state to put into GitStation's confirmation URL (returned once, stored sealed). */
export async function openAttempt(
  projectId: string,
  userId: string,
  subject: AttemptSubject,
  now: Date,
  random: (bytes: number) => Buffer = randomBytes,
): Promise<{ id: string; state: string; expiresAt: Date }> {
  await prisma.gitMrApprovalAttempt.deleteMany({ where: { userId, expiresAt: { lt: new Date(now.getTime() - PURGE_AFTER_MS) } } })
  const openCount = await prisma.gitMrApprovalAttempt.count({ where: { userId, finishedAt: null, expiresAt: { gt: now } } })
  if (openCount >= MAX_OPEN_ATTEMPTS) throw statusError(429, "RATE_LIMITED", "確認を開きすぎています。少し待ってからやり直してください")
  // 256 bits, base64url (43 characters): inside GitStation's [A-Za-z0-9_-]{22,128}.
  const state = random(32).toString("base64url")
  const expiresAt = new Date(now.getTime() + ATTEMPT_TTL_MS)
  const columns = columnsOf(subject)
  const row = await prisma.gitMrApprovalAttempt.create({
    data: { projectId, userId, intent: subject.intent, stateCipher: seal(state), expiresAt, ...columns },
    select: { id: true },
  })
  return { id: row.id, state, expiresAt }
}

/** Ends an open row (a finished one keeps how it ended). */
export async function finishAttempt(attemptId: string, outcome: AttemptOutcome, now: Date): Promise<void> {
  await prisma.gitMrApprovalAttempt.updateMany({ where: { id: attemptId, finishedAt: null }, data: { finishedAt: now, outcome, claimingAt: null } })
}

/**
 * The attempt of `userId` in `projectId` with one of `intents`, locked for one claim. Another user's attempt (or
 * another feature's) is "not found": its existence is not shown. A finished or expired one cannot be used; a claim in
 * flight refuses a second press (GIT_APPROVAL_BUSY).
 */
export async function lockAttempt(projectId: string, userId: string, attemptId: string, intents: readonly ActAsIntent[], now: Date): Promise<ActAsAttempt> {
  const attempt = await prisma.gitMrApprovalAttempt.findFirst({ where: { id: attemptId, projectId } })
  if (!attempt || attempt.userId !== userId || !intents.includes(attempt.intent as ActAsIntent)) throw new NotFoundError("Confirmation not found")
  if (attempt.finishedAt) throw statusError(409, "GIT_APPROVAL_RETRY", "この確認は使用済みです")
  if (attempt.expiresAt <= now) {
    await finishAttempt(attempt.id, "failed", now)
    throw statusError(409, "GIT_APPROVAL_RETRY", "確認の期限が切れました")
  }
  // Take the claim lock (compare-and-set): two presses never both claim.
  const locked = await prisma.gitMrApprovalAttempt.updateMany({
    where: { id: attempt.id, finishedAt: null, OR: [{ claimingAt: null }, { claimingAt: { lt: new Date(now.getTime() - CLAIM_LOCK_MS) } }] },
    data: { claimingAt: now },
  })
  if (locked.count !== 1) throw new ConflictError("処理中です", {}, "GIT_APPROVAL_BUSY")
  return attempt
}

/**
 * Claims the person's confirmation of a locked attempt. `prepare` reads everything that can fail BEFORE the claim (a
 * claim hands its one-time secret out only once) and returns the client to claim with. `toServiceError` turns a
 * GitStation refusal into the feature's error (logged once there).
 */
export async function claimAttempt<T>(
  attempt: ActAsAttempt,
  now: Date,
  context: Record<string, unknown>,
  prepare: () => Promise<{ client: GitStationClient; value: T }>,
  toServiceError: (e: unknown, context: Record<string, unknown>) => Error,
): Promise<{ claim: GitStationActAsClaim; value: T }> {
  // Releases only this request's own lock (a later press that took over a stale lock keeps its own).
  const release = () => prisma.gitMrApprovalAttempt.updateMany({ where: { id: attempt.id, finishedAt: null, claimingAt: now }, data: { claimingAt: null } })
  try {
    const { client, value } = await prepare()
    const state = open(attempt.stateCipher)
    if (!state) {
      await finishAttempt(attempt.id, "failed", now)
      throw statusError(409, "GIT_APPROVAL_RETRY", "確認をやり直してください")
    }
    return { claim: await client.claimActAs(state), value }
  } catch (e) {
    // Not pressed yet: the person may press "確認しました" again once they did.
    if (e instanceof GitStationError && e.detail.errorCode === "FG-AUTH-0020" && e.status === 403) {
      // GitStation gives no reason in the body: claim_unknown (not pressed) is the expected one; an expired or
      // repeated claim makes the attempt useless, which the person sees as "確認をやり直してください" after 10 min.
      await release()
      throw statusError(409, "GIT_APPROVAL_NOT_CONFIRMED", "GitStation でまだ確認されていません")
    }
    // Refused before GitStation looked at the state (rate limit): usable again.
    if (e instanceof GitStationError && e.kind === "rate_limited") {
      await release()
      throw toServiceError(e, context)
    }
    // Anything else (a lost answer included — the claim may have been spent): this attempt is over; the person
    // starts again rather than being told "not confirmed" until the attempt expires.
    await finishAttempt(attempt.id, "failed", now).catch((finishError: unknown) =>
      log.error("gitstation act-as attempt not closed", { ...context, error: finishError instanceof Error ? finishError.message : String(finishError) }),
    )
    if (e instanceof GitStationError && (e.kind === "network" || e.kind === "unavailable")) {
      toServiceError(e, context)
      throw statusError(409, "GIT_APPROVAL_RETRY", "GitStation の応答を受け取れませんでした。もう一度確認してください")
    }
    if (e instanceof StatusError || e instanceof NotFoundError) throw e
    throw toServiceError(e, context)
  }
}

/**
 * ADR-0025 Risks: the person who pressed in GitStation must be the Kanflow user who started (a shared PC with someone
 * else's GitStation session). The claim names them by employee number (scope user_employee_number); without it the
 * person cannot be checked and nothing is sent. A mismatch discards the attempt.
 */
export async function assertClaimedBySamePerson(attempt: ActAsAttempt, claim: GitStationActAsClaim, employeeNumber: string | null, now: Date, context: Record<string, unknown>): Promise<void> {
  if (claim.sub.employeeNumber && employeeNumber && claim.sub.employeeNumber === employeeNumber) return
  await finishAttempt(attempt.id, "discarded", now)
  log.warn("gitstation act-as claim discarded", { ...context, mismatch: claim.sub.employeeNumber ? "sub" : "sub_unnamed", stationUserId: claim.sub.userId })
  if (!claim.sub.employeeNumber) throw statusError(409, "GIT_APPROVAL_CONFIG", "GitStation が確認した人の社員番号を返しませんでした")
  throw statusError(409, "GIT_APPROVAL_DIFFERENT_USER", "GitStation で確認した人が違います")
}

/** The claim does not match what the attempt asked for: discarded, never sent. */
export async function discardClaim(attempt: ActAsAttempt, mismatch: string, now: Date, context: Record<string, unknown>): Promise<void> {
  await finishAttempt(attempt.id, "discarded", now)
  log.warn("gitstation act-as claim discarded", { ...context, mismatch })
}

/** The user's employee number exactly as stored (null = none). */
export async function employeeNumberOf(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { employeeNumber: true } })
  return user?.employeeNumber ?? null
}
