import { randomBytes } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { open, seal } from "@/lib/secret-box"
import { GitStationError, isEmployeeNumber, isObjectId, type ActAsTrial, type ApprovalIntent, type GitStationActAsClaim, type GitStationClient } from "@/lib/git/gitstation-client"
import { pbiKey } from "@/lib/git/pbi-keys"
import { ConflictError, ForbiddenError, NotFoundError, StatusError, ValidationError } from "@/services/_shared"
import type { ApiErrorCode } from "@/services/_shared/error-codes"
import { repositoryToken } from "./git-sync"
import { createGitStationSource, defaultGitStationClientFactory, NotBoundError, type GitStationClientFactory } from "./gitstation-source"

/**
 * Approve / withdraw a GitStation merge request from Kanflow's PBI panel (plan 11 K4, F-36), through GitStation's
 * act-as (ADR-0025 §5, runbook act-as):
 *
 *  1. start: Kanflow makes a `state` (256 random bits), binds it to the signed-in Kanflow user, the merge request
 *     link and the head the person was shown, and returns GitStation's confirmation URL. The browser opens it in a
 *     new top-level window (GitStation refuses frames); the person presses there — Kanflow takes no part.
 *  2. complete (確認しました): Kanflow claims the confirmation with the state (service-account token, no
 *     Forge-Act-As), checks that the person GitStation names (`sub`) IS the Kanflow user who started, and that the
 *     claim is for this merge request, intent and head; then sends the approval with `Forge-Act-As: user:<sub>` and
 *     the assertion. Anything that does not match is discarded (never sent).
 *
 * The buttons are a hint read from GitStation's status as the person (`Forge-Act-As: employee:<n>`): GitStation
 * decides every approval again. The person is named by the employee number Kanflow stores, exactly as stored.
 */

const log = logger.child({ module: "git-mr-approvals" })

/** GitStation's confirmation page expires after 10 minutes. */
export const ATTEMPT_TTL_MS = 10 * 60_000
/** A claim in flight blocks a second press for this long (then the row can be claimed again). */
export const CLAIM_LOCK_MS = 30_000
/** Expired rows are removed a day later (on the next start of the same user). */
const PURGE_AFTER_MS = 24 * 60 * 60_000
/** Open merge requests of one PBI whose state is read (each is one status read). */
export const MAX_MRS_READ = 10
/** Attempts one user may have open at once (each is a GitStation confirmation). */
const MAX_OPEN_ATTEMPTS = 20

export interface MrApprovalDeps {
  clientFactory?: GitStationClientFactory
  now?: () => Date
  random?: (bytes: number) => Buffer
}

export interface MrApprovalItem {
  linkId: string
  iid: number
  headSha: string | null
  /** Live approvals of the current head (GitStation dev-status); null = not reported. */
  approvals: number | null
  approvedByMe: boolean
  canApprove: ActAsTrial
  canUnapprove: ActAsTrial
}

export type MrApprovalsResult =
  | { supported: false; reason: "off" | "provider" | "no_employee_number" }
  | { supported: true; items: MrApprovalItem[]; failed: string[] }

export interface StartedApproval {
  attemptId: string
  confirmUrl: string
  expiresAt: string
}

export interface CompletedApproval {
  outcome: "approved" | "withdrawn" | "unchanged"
  counted: boolean
}

const err = (status: number, code: ApiErrorCode, message: string, extra?: Record<string, unknown>) => new StatusError(status, message, extra, code)

interface Station {
  client: GitStationClient
  apiBase: string
  integrationId: string
  /** GitStation's project id of the link's repository (path resolved and binding checked, never the stored id). */
  stationProjectId: () => Promise<number>
}

/** The integration of the project when it reads GitStation, else null (Git off / GitLab). */
async function stationIntegration(projectId: string) {
  const integration = await prisma.gitIntegration.findUnique({ where: { projectId } })
  if (!integration?.enabled) return { integration: null, reason: "off" as const }
  if (integration.provider !== "gitstation") return { integration: null, reason: "provider" as const }
  return { integration, reason: null }
}

function stationFor(
  projectId: string,
  integration: { tokenCipher: string | null; stationIntegrationId: string | null },
  repo: { id: string; apiBase: string; repoPath: string; externalId: number | null; tokenCipher: string | null },
  factory: GitStationClientFactory,
): Station {
  const integrationId = integration.stationIntegrationId?.trim()
  const token = repositoryToken(repo, integration)
  if (!integrationId || !token) throw err(409, "GIT_APPROVAL_CONFIG", "GitStation の連携 ID かトークンが未設定です")
  const client = factory({ apiBase: repo.apiBase, token, integrationId })
  const source = createGitStationSource({ repositoryId: repo.id, projectId, stationIntegrationId: integrationId, apiBase: repo.apiBase, repoPath: repo.repoPath, externalId: repo.externalId, token }, () => client)
  let located: Promise<number> | null = null
  return { client, apiBase: repo.apiBase.replace(/\/+$/, ""), integrationId, stationProjectId: () => (located ??= source.locate()) }
}

async function employeeNumberOf(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { employeeNumber: true } })
  return user?.employeeNumber ?? null
}

/**
 * A GitStation refusal as the error the screen explains (ja / en / id by code). Logged once here with GitStation's
 * error code — never the assertion, the state or the employee number.
 */
function toServiceError(e: unknown, context: Record<string, unknown>): Error {
  if (e instanceof NotBoundError) return err(409, "GIT_APPROVAL_CONFIG", "リポジトリが GitStation でこのプロジェクトに結びついていません")
  if (!(e instanceof GitStationError)) return e instanceof Error ? e : new Error(String(e))
  const code = e.detail.errorCode
  log.warn("gitstation approval refused", { ...context, kind: e.kind, status: e.status, errorCode: code })
  if (e.kind === "rate_limited") return err(429, "RATE_LIMITED", "GitStation の回数の上限です", { retryAfterSec: e.detail.retryAfterSec ?? null })
  if (e.kind === "act_as_target_invalid") return err(409, "GIT_APPROVAL_NO_EMPLOYEE_NUMBER", "社員番号を GitStation に渡せません")
  switch (code) {
    case "FG-AUTH-0020":
      return err(409, "GIT_APPROVAL_RETRY", "確認をやり直してください")
    case "FG-INT-0006":
      return err(409, "GIT_APPROVAL_IDENTITY", "この利用者の代わりに操作できません")
    case "FG-AUTH-0003":
      return err(403, "GIT_APPROVAL_NOT_ALLOWED", "この MR を承認する権限がありません")
    case "FG-REVIEW-0013":
      return err(403, "GIT_APPROVAL_SELF", "自分の MR は承認できません")
    case "FG-REVIEW-0008":
      return err(409, "GIT_APPROVAL_STALE", "MR が更新されました")
    case "FG-AUTH-0002":
    case "FG-REPO-0005":
      return err(409, "GIT_APPROVAL_CONFIG", "連携の設定の問題で承認できません")
  }
  if (e.kind === "auth" || e.kind === "host_not_allowed") return err(409, "GIT_APPROVAL_CONFIG", "連携の設定の問題で承認できません")
  if (e.kind === "not_found") return err(404, "NOT_FOUND", "MR が見つかりません")
  return err(502, "UPSTREAM_FAILED", "GitStation に接続できませんでした")
}

const CLOSED: ActAsTrial = { allowed: false, reason: null }

/**
 * Per open GitStation merge request of the PBI: what the signed-in user could do through GitStation (with a
 * confirmation) and the live approval count. A merge request whose state cannot be read is listed in `failed`
 * (its buttons are not shown) — the panel itself never fails for it.
 */
export async function getMrApprovals(projectId: string, pbiId: string, userId: string, deps: MrApprovalDeps = {}): Promise<MrApprovalsResult> {
  const { integration, reason } = await stationIntegration(projectId)
  if (!integration) return { supported: false, reason }
  const pbi = await prisma.productBacklogItem.findFirst({ where: { id: pbiId, projectId, deletedAt: null }, select: { displayId: true } })
  if (!pbi) throw new NotFoundError("PBI not found")
  const employeeNumber = await employeeNumberOf(userId)
  if (!isEmployeeNumber(employeeNumber)) return { supported: false, reason: "no_employee_number" }
  const links = await prisma.gitLink.findMany({
    where: { projectId, backlogItemId: pbiId, kind: "mr", state: { in: ["opened", "locked"] } },
    include: { repository: true },
    orderBy: { occurredAt: "desc" },
    take: MAX_MRS_READ,
  })
  const factory = deps.clientFactory ?? defaultGitStationClientFactory
  const items: MrApprovalItem[] = []
  const failed: string[] = []
  const byRepo = new Map<string, typeof links>()
  for (const l of links) byRepo.set(l.repositoryId, [...(byRepo.get(l.repositoryId) ?? []), l])
  for (const group of byRepo.values()) {
    let station: Station
    let approvals = new Map<string, number | null>()
    let stationProjectId: number
    try {
      station = stationFor(projectId, integration, group[0].repository, factory)
      stationProjectId = await station.stationProjectId()
    } catch (e) {
      log.warn("gitstation approval state unreadable", { projectId, repositoryId: group[0].repositoryId, error: e instanceof Error ? e.message : String(e) })
      failed.push(...group.map((l) => l.id))
      continue
    }
    try {
      approvals = await station.client.workItemApprovals(pbiKey(pbi.displayId), projectId)
    } catch (e) {
      // The count is extra information: without it the buttons still work.
      log.warn("gitstation approval count unreadable", { projectId, repositoryId: group[0].repositoryId, error: e instanceof Error ? e.message : String(e) })
    }
    // At most MAX_MRS_READ reads, in parallel (one panel load).
    await Promise.all(group.map(async (link) => {
      const iid = Number(link.ref)
      if (!Number.isSafeInteger(iid) || iid <= 0) return
      try {
        const status = await station.client.mergeRequestStatusAs(stationProjectId, iid, employeeNumber)
        if (!status.open) return
        const actAs = status.actAs
        items.push({
          linkId: link.id,
          iid,
          headSha: status.headSha,
          approvals: approvals.get(`${stationProjectId}!${iid}`) ?? null,
          approvedByMe: status.approvedByMe,
          // No head yet: nothing can be approved. No act-as answer: nothing is offered (fail closed).
          canApprove: status.headSha && actAs ? actAs.canApprove : CLOSED,
          canUnapprove: status.headSha && actAs ? actAs.canUnapprove : CLOSED,
        })
      } catch (e) {
        const reason = e instanceof GitStationError && e.detail.errorCode === "FG-INT-0006" ? "identity" : "unreadable"
        log.warn("gitstation approval state unreadable", { projectId, linkId: link.id, reason, kind: e instanceof GitStationError ? e.kind : undefined, errorCode: e instanceof GitStationError ? e.detail.errorCode : undefined })
        failed.push(link.id)
      }
    }))
  }
  // Same order as the panel lists them (newest first), whatever order the reads finished in.
  const order = new Map(links.map((l, i) => [l.id, i]))
  items.sort((a, b) => (order.get(a.linkId) ?? 0) - (order.get(b.linkId) ?? 0))
  return { supported: true, items, failed }
}

/** The link of an approval inside the project, with its repository and the GitStation integration. */
async function loadLink(projectId: string, linkId: string) {
  const { integration } = await stationIntegration(projectId)
  if (!integration) throw err(409, "GIT_APPROVAL_UNAVAILABLE", "このプロジェクトは GitStation と連携していません")
  const link = await prisma.gitLink.findFirst({ where: { id: linkId, projectId, kind: "mr" }, include: { repository: true } })
  if (!link) throw new NotFoundError("MR not found")
  const iid = Number(link.ref)
  if (!Number.isSafeInteger(iid) || iid <= 0) throw err(409, "GIT_APPROVAL_UNAVAILABLE", "この MR は承認できません")
  return { integration, link, iid }
}

/**
 * 承認する / 承認を取り消す: checks with GitStation (as the person) that the action is allowed on the current
 * head, then stores a new attempt and returns GitStation's confirmation URL for it.
 */
export async function startMrApproval(projectId: string, userId: string, input: { linkId: string; intent: ApprovalIntent }, deps: MrApprovalDeps = {}): Promise<StartedApproval> {
  if (input.intent !== "approve" && input.intent !== "unapprove") throw new ValidationError("intent must be approve or unapprove")
  const now = (deps.now ?? (() => new Date()))()
  const random = deps.random ?? randomBytes
  const { integration, link, iid } = await loadLink(projectId, input.linkId)
  const employeeNumber = await employeeNumberOf(userId)
  if (!isEmployeeNumber(employeeNumber)) throw err(409, "GIT_APPROVAL_NO_EMPLOYEE_NUMBER", "社員番号が登録されていません")
  const station = stationFor(projectId, integration, link.repository, deps.clientFactory ?? defaultGitStationClientFactory)
  const context = { projectId, linkId: link.id, intent: input.intent }
  let stationProjectId: number
  let headSha: string
  try {
    stationProjectId = await station.stationProjectId()
    const status = await station.client.mergeRequestStatusAs(stationProjectId, iid, employeeNumber)
    const trial = input.intent === "approve" ? status.actAs?.canApprove : status.actAs?.canUnapprove
    if (!status.open || !status.headSha) throw err(409, "GIT_APPROVAL_UNAVAILABLE", "この MR は承認できません")
    if (!trial?.allowed) {
      if (trial?.reason === "self_approval") throw err(403, "GIT_APPROVAL_SELF", "自分の MR は承認できません")
      throw err(403, "GIT_APPROVAL_NOT_ALLOWED", "この MR を承認する権限がありません", { reason: trial?.reason ?? null })
    }
    headSha = status.headSha
  } catch (e) {
    if (e instanceof StatusError) throw e
    throw toServiceError(e, context)
  }

  await prisma.gitMrApprovalAttempt.deleteMany({ where: { userId, expiresAt: { lt: new Date(now.getTime() - PURGE_AFTER_MS) } } })
  const open = await prisma.gitMrApprovalAttempt.count({ where: { userId, finishedAt: null, expiresAt: { gt: now } } })
  if (open >= MAX_OPEN_ATTEMPTS) throw err(429, "RATE_LIMITED", "確認を開きすぎています。少し待ってからやり直してください")
  // 256 bits, base64url (43 characters): inside GitStation's [A-Za-z0-9_-]{22,128}.
  const state = random(32).toString("base64url")
  const expiresAt = new Date(now.getTime() + ATTEMPT_TTL_MS)
  const attempt = await prisma.gitMrApprovalAttempt.create({
    data: { projectId, userId, gitLinkId: link.id, intent: input.intent, headSha, stateCipher: seal(state), expiresAt },
    select: { id: true },
  })
  const query = new URLSearchParams({ intent: input.intent, sha: headSha, integration: station.integrationId, state })
  const confirmUrl = `${station.apiBase}/-/confirm/projects/${stationProjectId}/merge-requests/${iid}?${query.toString()}`
  log.info("gitstation approval started", { ...context, attemptId: attempt.id })
  return { attemptId: attempt.id, confirmUrl, expiresAt: expiresAt.toISOString() }
}

async function finish(attemptId: string, outcome: "approved" | "withdrawn" | "unchanged" | "discarded" | "failed", now: Date): Promise<void> {
  // Only an open row: a finished one keeps how it ended.
  await prisma.gitMrApprovalAttempt.updateMany({ where: { id: attemptId, finishedAt: null }, data: { finishedAt: now, outcome, claimingAt: null } })
}

/**
 * 確認しました: claim the person's confirmation and send the approval. Only the user who started the attempt may
 * complete it; a second press while a claim is in flight is refused (GIT_APPROVAL_BUSY), and a finished attempt is
 * never sent again. Before the person pressed in GitStation the attempt stays open (GIT_APPROVAL_NOT_CONFIRMED).
 */
export async function completeMrApproval(projectId: string, userId: string, attemptId: string, deps: MrApprovalDeps = {}): Promise<CompletedApproval> {
  const now = (deps.now ?? (() => new Date()))()
  const attempt = await prisma.gitMrApprovalAttempt.findFirst({ where: { id: attemptId, projectId } })
  // Another user's attempt is "not found": its existence is not shown.
  if (!attempt || attempt.userId !== userId) throw new NotFoundError("Approval not found")
  if (attempt.finishedAt) throw err(409, "GIT_APPROVAL_RETRY", "この確認は使用済みです")
  if (attempt.expiresAt <= now) {
    await finish(attempt.id, "failed", now)
    throw err(409, "GIT_APPROVAL_RETRY", "確認の期限が切れました")
  }
  // Take the claim lock (compare-and-set): two presses never both claim.
  const locked = await prisma.gitMrApprovalAttempt.updateMany({
    where: { id: attempt.id, finishedAt: null, OR: [{ claimingAt: null }, { claimingAt: { lt: new Date(now.getTime() - CLAIM_LOCK_MS) } }] },
    data: { claimingAt: now },
  })
  if (locked.count !== 1) throw new ConflictError("処理中です", {}, "GIT_APPROVAL_BUSY")

  const context = { projectId, attemptId: attempt.id, linkId: attempt.gitLinkId, intent: attempt.intent }
  // Releases only this request's own lock (a later press that took over a stale lock keeps its own).
  const release = () => prisma.gitMrApprovalAttempt.updateMany({ where: { id: attempt.id, finishedAt: null, claimingAt: now }, data: { claimingAt: null } })
  let claim: GitStationActAsClaim
  let station: Station
  let iid: number
  let stationProjectId: number
  let employeeNumber: string | null
  try {
    const loaded = await loadLink(projectId, attempt.gitLinkId)
    iid = loaded.iid
    station = stationFor(projectId, loaded.integration, loaded.link.repository, deps.clientFactory ?? defaultGitStationClientFactory)
    // Everything that can fail is read BEFORE the claim: a claim hands its one-time secret out only once.
    employeeNumber = await employeeNumberOf(userId)
    stationProjectId = await station.stationProjectId()
    const state = open(attempt.stateCipher)
    if (!state) {
      await finish(attempt.id, "failed", now)
      throw err(409, "GIT_APPROVAL_RETRY", "確認をやり直してください")
    }
    claim = await station.client.claimActAs(state)
  } catch (e) {
    // Not pressed yet: the person may press "確認しました" again once they did.
    if (e instanceof GitStationError && e.detail.errorCode === "FG-AUTH-0020" && e.status === 403) {
      // GitStation gives no reason in the body: claim_unknown (not pressed) is the expected one; an expired or
      // repeated claim makes the attempt useless, which the person sees as "確認をやり直してください" after 10 min.
      await release()
      throw err(409, "GIT_APPROVAL_NOT_CONFIRMED", "GitStation でまだ確認されていません")
    }
    // Refused before GitStation looked at the state (rate limit), or the repository check failed: usable again.
    if (e instanceof GitStationError && e.kind === "rate_limited") {
      await release()
      throw toServiceError(e, context)
    }
    // Anything else (a lost answer included — the claim may have been spent): this attempt is over; the person
    // starts again rather than being told "not confirmed" until the attempt expires.
    await finish(attempt.id, "failed", now).catch((finishError: unknown) =>
      log.error("gitstation approval attempt not closed", { ...context, error: finishError instanceof Error ? finishError.message : String(finishError) }),
    )
    if (e instanceof GitStationError && (e.kind === "network" || e.kind === "unavailable")) {
      toServiceError(e, context)
      throw err(409, "GIT_APPROVAL_RETRY", "GitStation の応答を受け取れませんでした。もう一度確認してください")
    }
    if (e instanceof StatusError || e instanceof NotFoundError) throw e
    throw toServiceError(e, context)
  }

  // From here the claim's secret is in hand: whatever happens, the attempt is finished (the secret is never stored).
  try {
    const mismatch =
      claim.intent !== attempt.intent ? "intent"
        // A merge request intent names no Kanflow project and targets a branch (a binding intent's claim is never used here).
        : claim.kanflowProjectId !== null || !claim.targetRef?.startsWith("refs/heads/") ? "intent"
        : claim.projectId !== stationProjectId ? "project"
          : claim.iid !== iid ? "merge_request"
            : claim.headSha !== attempt.headSha || !isObjectId(claim.headSha) ? "head"
              : null
    if (mismatch) {
      await finish(attempt.id, "discarded", now)
      log.warn("gitstation approval claim discarded", { ...context, mismatch })
      throw err(409, mismatch === "head" ? "GIT_APPROVAL_STALE" : "GIT_APPROVAL_RETRY", "確認の内容が違います")
    }
    // ADR-0025 Risks: the person who pressed in GitStation must be the Kanflow user who started (a shared PC with
    // someone else's GitStation session). The claim names them by employee number (scope user_employee_number);
    // without it the person cannot be checked and nothing is sent.
    if (!claim.sub.employeeNumber || !employeeNumber || claim.sub.employeeNumber !== employeeNumber) {
      await finish(attempt.id, "discarded", now)
      log.warn("gitstation approval claim discarded", { ...context, mismatch: claim.sub.employeeNumber ? "sub" : "sub_unnamed", stationUserId: claim.sub.userId })
      if (!claim.sub.employeeNumber) throw err(409, "GIT_APPROVAL_CONFIG", "GitStation が確認した人の社員番号を返しませんでした")
      throw err(409, "GIT_APPROVAL_DIFFERENT_USER", "GitStation で確認した人が違います")
    }
    const answer = await station.client.approveAs(stationProjectId, iid, attempt.intent as ApprovalIntent, { userId: claim.sub.userId, assertion: claim.assertion, sha: claim.headSha as string })
    await finish(attempt.id, answer.outcome, now)
    log.info("gitstation approval sent", { ...context, outcome: answer.outcome, counted: answer.counted })
    return answer
  } catch (e) {
    await prisma.gitMrApprovalAttempt.updateMany({ where: { id: attempt.id, finishedAt: null }, data: { finishedAt: now, outcome: "failed", claimingAt: null } })
    if (e instanceof StatusError || e instanceof ForbiddenError) throw e
    throw toServiceError(e, context)
  }
}
