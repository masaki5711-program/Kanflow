import type { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { GitStationError, isEmployeeNumber, isObjectId, type ActAsTrial, type ApprovalIntent, type GitStationClient } from "@/lib/git/gitstation-client"
import { pbiKey } from "@/lib/git/pbi-keys"
import { ForbiddenError, NotFoundError, StatusError, ValidationError } from "@/services/_shared"
import { assertClaimedBySamePerson, claimAttempt, discardClaim, employeeNumberOf, finishAfterWrite, finishAttempt, lockAttempt, MR_INTENTS, openAttempt, statusError as err } from "./act-as-attempts"
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

/** The attempt's lifetime and claim lock (shared with X3's binding attempts, act-as-attempts). */
export { ATTEMPT_TTL_MS, CLAIM_LOCK_MS } from "./act-as-attempts"
/** Open merge requests of one PBI whose state is read (each is one status read). */
export const MAX_MRS_READ = 10
/** Open merge requests of the project whose state is read for the dashboard (newest first). */
export const MAX_AWAITING_READ = 20
/** Status reads in flight at once (one dashboard load must not burst GitStation). */
export const STATUS_READS_AT_ONCE = 4
/** The dashboard is opened often: one user's answer for one project is reused this long. */
export const AWAITING_CACHE_TTL_MS = 60_000
/** Cached answers kept at most (the oldest goes first). */
const AWAITING_CACHE_MAX = 500

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

type StationIntegration = NonNullable<Awaited<ReturnType<typeof stationIntegration>>["integration"]>
type LinkWithRepository = Prisma.GitLinkGetPayload<{ include: { repository: true } }>

/** `fn` over `items`, at most `limit` at a time; the results in the order of `items`. */
async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array<R>(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

/**
 * The approval state of `links` as the person (`employeeNumber`): each repository is located once, then every
 * merge request's status is read as the person, at most STATUS_READS_AT_ONCE at a time. A merge request whose
 * state cannot be read is listed in `failed` and logged once here (never fatal). `counts` optionally reads the
 * live approval counts of one repository (extra information: a failure only drops the count).
 */
async function readApprovalStates(
  projectId: string,
  integration: StationIntegration,
  links: readonly LinkWithRepository[],
  employeeNumber: string,
  factory: GitStationClientFactory,
  counts?: (station: Station) => Promise<Map<string, number | null>>,
): Promise<{ items: Map<string, MrApprovalItem>; failed: string[] }> {
  const items = new Map<string, MrApprovalItem>()
  const failed: string[] = []
  const byRepo = new Map<string, LinkWithRepository[]>()
  for (const l of links) byRepo.set(l.repositoryId, [...(byRepo.get(l.repositoryId) ?? []), l])
  type Read = { link: LinkWithRepository; station: Station; stationProjectId: number; approvals: Map<string, number | null> }
  // Each repository is located once (and its count read), STATUS_READS_AT_ONCE repositories at a time.
  const located = await mapLimit([...byRepo.values()], STATUS_READS_AT_ONCE, async (group): Promise<Read[]> => {
    let station: Station
    let stationProjectId: number
    try {
      station = stationFor(projectId, integration, group[0].repository, factory)
      stationProjectId = await station.stationProjectId()
    } catch (e) {
      log.warn("gitstation approval state unreadable", { projectId, repositoryId: group[0].repositoryId, error: e instanceof Error ? e.message : String(e) })
      failed.push(...group.map((l) => l.id))
      return []
    }
    let approvals = new Map<string, number | null>()
    if (counts) {
      try {
        approvals = await counts(station)
      } catch (e) {
        // The count is extra information: without it the buttons still work.
        log.warn("gitstation approval count unreadable", { projectId, repositoryId: group[0].repositoryId, error: e instanceof Error ? e.message : String(e) })
      }
    }
    return group.map((link) => ({ link, station, stationProjectId, approvals }))
  })
  const reads = located.flat()
  await mapLimit(reads, STATUS_READS_AT_ONCE, async ({ link, station, stationProjectId, approvals }) => {
    const iid = Number(link.ref)
    if (!Number.isSafeInteger(iid) || iid <= 0) return
    try {
      const status = await station.client.mergeRequestStatusAs(stationProjectId, iid, employeeNumber)
      if (!status.open) return
      const actAs = status.actAs
      items.set(link.id, {
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
  })
  return { items, failed }
}

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
  const { items, failed } = await readApprovalStates(projectId, integration, links, employeeNumber, factory, (station) => station.client.workItemApprovals(pbiKey(pbi.displayId), projectId))
  // Same order as the panel lists them (newest first), whatever order the reads finished in.
  return { supported: true, items: links.flatMap((l) => items.get(l.id) ?? []), failed }
}

/** One merge request the user could approve now, with the PBI it belongs to (the dashboard's 承認を待っている MR). */
export interface AwaitingMrApprovalItem extends MrApprovalItem {
  pbiId: string
  pbiKey: string
  /** The PBI's number (its link: /projects/<id>/backlog?pbi=<displayId>). */
  pbiDisplayId: number
  /** The merge request's title. */
  title: string
  url: string
}

export type AwaitingMrApprovalsResult =
  | { supported: false; reason: "off" | "provider" | "no_employee_number" }
  | { supported: true; items: AwaitingMrApprovalItem[]; failed: string[] }


const awaitingCache = new Map<string, { expiresAt: number; value: AwaitingMrApprovalsResult }>()
/**
 * The read in flight per key: concurrent requests share it, and only the read still registered here when it ends
 * may store its answer — a forget (approve / withdraw) unregisters it, so a read that started before the approval
 * never re-caches the old list.
 */
const awaitingInFlight = new Map<string, Promise<AwaitingMrApprovalsResult>>()
const cacheKey = (userId: string, projectId: string) => `${userId}\u0000${projectId}`

/** Drop one user's cached answer and read in flight (after their approve / withdraw), or every one (tests). */
export function forgetAwaitingMrApprovals(userId?: string, projectId?: string): void {
  if (userId === undefined || projectId === undefined) {
    awaitingCache.clear()
    awaitingInFlight.clear()
    return
  }
  const key = cacheKey(userId, projectId)
  awaitingCache.delete(key)
  awaitingInFlight.delete(key)
}

function storeAwaiting(key: string, value: AwaitingMrApprovalsResult, now: number): void {
  if (awaitingCache.size >= AWAITING_CACHE_MAX) {
    for (const [k, v] of awaitingCache) if (v.expiresAt <= now) awaitingCache.delete(k)
    // Still full: the oldest entry (Map keeps insertion order) goes.
    if (awaitingCache.size >= AWAITING_CACHE_MAX) {
      const oldest = awaitingCache.keys().next()
      if (!oldest.done) awaitingCache.delete(oldest.value)
    }
  }
  awaitingCache.set(key, { expiresAt: now + AWAITING_CACHE_TTL_MS, value })
}

/**
 * 承認を待っている MR: the project's open GitStation merge requests the signed-in user could approve now
 * (GitStation allows it for this person and they have not approved yet). At most MAX_AWAITING_READ merge requests
 * are read (newest first), each as the person, STATUS_READS_AT_ONCE at a time; concurrent requests of one user
 * share one read. A complete answer is kept for AWAITING_CACHE_TTL_MS per (user, project) and dropped when this
 * user approves / withdraws through Kanflow; an answer with failures is never kept (the next load reads again).
 * The cache is per process. The approval count is not read here (one dev-status read per PBI): `approvals` is null.
 */
export async function getAwaitingMrApprovals(projectId: string, userId: string, deps: MrApprovalDeps = {}): Promise<AwaitingMrApprovalsResult> {
  const clock = deps.now ?? (() => new Date())
  const key = cacheKey(userId, projectId)
  const cached = awaitingCache.get(key)
  if (cached && cached.expiresAt > clock().getTime()) return cached.value
  if (cached) awaitingCache.delete(key)
  const running = awaitingInFlight.get(key)
  if (running) return running

  const read: Promise<AwaitingMrApprovalsResult> = readAwaiting(projectId, userId, deps).then(
    (value) => {
      // Still the registered read (no forget meanwhile) and nothing failed: keep it.
      if (awaitingInFlight.get(key) === read && !(value.supported && value.failed.length > 0)) storeAwaiting(key, value, clock().getTime())
      return value
    },
  ).finally(() => {
    if (awaitingInFlight.get(key) === read) awaitingInFlight.delete(key)
  })
  awaitingInFlight.set(key, read)
  return read
}

async function readAwaiting(projectId: string, userId: string, deps: MrApprovalDeps): Promise<AwaitingMrApprovalsResult> {
  const { integration, reason } = await stationIntegration(projectId)
  if (!integration) return { supported: false, reason }
  const employeeNumber = await employeeNumberOf(userId)
  if (!isEmployeeNumber(employeeNumber)) return { supported: false, reason: "no_employee_number" }
  const links = await prisma.gitLink.findMany({
    where: { projectId, kind: "mr", state: { in: ["opened", "locked"] }, backlogItem: { deletedAt: null } },
    include: { repository: true, backlogItem: { select: { id: true, displayId: true } } },
    orderBy: [{ occurredAt: "desc" }, { id: "asc" }],
    take: MAX_AWAITING_READ,
  })
  const { items, failed } = await readApprovalStates(projectId, integration, links, employeeNumber, deps.clientFactory ?? defaultGitStationClientFactory)
  const awaiting = links.flatMap((l): AwaitingMrApprovalItem[] => {
    const item = items.get(l.id)
    if (!item || item.approvedByMe || !item.canApprove.allowed) return []
    return [{ ...item, pbiId: l.backlogItem.id, pbiKey: pbiKey(l.backlogItem.displayId), pbiDisplayId: l.backlogItem.displayId, title: l.title, url: l.url }]
  })
  return { supported: true, items: awaiting, failed }
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

  const { id: attemptId, state, expiresAt } = await openAttempt(projectId, userId, { intent: input.intent, gitLinkId: link.id, headSha }, now, deps.random)
  const query = new URLSearchParams({ intent: input.intent, sha: headSha, integration: station.integrationId, state })
  const confirmUrl = `${station.apiBase}/-/confirm/projects/${stationProjectId}/merge-requests/${iid}?${query.toString()}`
  log.info("gitstation approval started", { ...context, attemptId })
  return { attemptId, confirmUrl, expiresAt: expiresAt.toISOString() }
}

/**
 * 確認しました: claim the person's confirmation and send the approval. Only the user who started the attempt may
 * complete it; a second press while a claim is in flight is refused (GIT_APPROVAL_BUSY), and a finished attempt is
 * never sent again. Before the person pressed in GitStation the attempt stays open (GIT_APPROVAL_NOT_CONFIRMED).
 */
export async function completeMrApproval(projectId: string, userId: string, attemptId: string, deps: MrApprovalDeps = {}): Promise<CompletedApproval> {
  const now = (deps.now ?? (() => new Date()))()
  const attempt = await lockAttempt(projectId, userId, attemptId, MR_INTENTS, now)
  const gitLinkId = attempt.gitLinkId
  const headSha = attempt.headSha
  const context = { projectId, attemptId: attempt.id, linkId: gitLinkId, intent: attempt.intent }
  // The CHECK makes an MR intent carry both; a row without them is not this feature's.
  if (!gitLinkId || !headSha) {
    await finishAttempt(attempt.id, "failed", now)
    throw new NotFoundError("Approval not found")
  }
  const { claim, value } = await claimAttempt(
    attempt,
    now,
    context,
    async () => {
      const loaded = await loadLink(projectId, gitLinkId)
      const station = stationFor(projectId, loaded.integration, loaded.link.repository, deps.clientFactory ?? defaultGitStationClientFactory)
      const employeeNumber = await employeeNumberOf(userId)
      const stationProjectId = await station.stationProjectId()
      return { client: station.client, value: { station, iid: loaded.iid, employeeNumber, stationProjectId } }
    },
    toServiceError,
  )
  const { station, iid, employeeNumber, stationProjectId } = value

  // From here the claim's secret is in hand: whatever happens, the attempt is finished (the secret is never stored).
  try {
    const mismatch =
      claim.intent !== attempt.intent ? "intent"
        // A merge request intent names no Kanflow project and targets a branch (a binding intent's claim is never used here).
        : claim.kanflowProjectId !== null || !claim.targetRef?.startsWith("refs/heads/") ? "intent"
        : claim.projectId !== stationProjectId ? "project"
          : claim.iid !== iid ? "merge_request"
            : claim.headSha !== headSha || !isObjectId(claim.headSha) ? "head"
              : null
    if (mismatch) {
      await discardClaim(attempt, mismatch, now, context)
      throw err(409, mismatch === "head" ? "GIT_APPROVAL_STALE" : "GIT_APPROVAL_RETRY", "確認の内容が違います")
    }
    await assertClaimedBySamePerson(attempt, claim, employeeNumber, now, context)
    const answer = await station.client.approveAs(stationProjectId, iid, attempt.intent as ApprovalIntent, { userId: claim.sub.userId, assertion: claim.assertion, sha: claim.headSha as string })
    await finishAfterWrite(attempt.id, answer.outcome, now, context)
    log.info("gitstation approval sent", { ...context, outcome: answer.outcome, counted: answer.counted })
    return answer
  } catch (e) {
    await finishAttempt(attempt.id, "failed", now)
    if (e instanceof StatusError || e instanceof ForbiddenError) throw e
    throw toServiceError(e, context)
  } finally {
    // The claim was used (sent or not): the dashboard's 承認を待っている MR is read again for this user.
    forgetAwaitingMrApprovals(userId, projectId)
  }
}
