import { createHash } from "node:crypto"
import type { GitAcceptanceReport, Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { GitStationError, isObjectId, type GitStationClient, type GitStationErrorKind } from "@/lib/git/gitstation-client"
import { ACCEPTANCE_COMMIT_MISSING_MESSAGE, ACCEPTANCE_REPORT_REFUSED_MESSAGE } from "@/lib/git/sync-messages"
import { OPEN_SPRINT_STATUSES } from "@/services/api-v1/api-v1.repository"
import { ACCEPTANCE_NO_FAILURE, acceptanceCheckInEffect, evaluateAcceptance, type AcceptanceSwitch, type AcceptanceVerdict } from "./acceptance-check-rules"
import type { DevClients, DevConnection } from "./dev-source"
import { repositoryToken } from "./git-sync"
import { isPermanentFailure, rereadBackoffMs } from "./gitstation-feed-sync"
import { createGitStationSource, gitStationErrorMessage, MissingIntegrationError, NotBoundError, stationClientFor } from "./gitstation-source"

/**
 * Reports the check `kanflow/acceptance` to GitStation (Checks API, docs/integration/gitstation-acceptance-check.md):
 * for every open merge request linked to PBIs, whether the work is ready to be accepted in Kanflow
 * (acceptance-check-rules). A report only — whether the check is required for a merge is GitStation's setting.
 *
 * Runs after the feed sync of each poller tick, for projects that read GitStation and have the switch on
 * (git_integration.stationAcceptanceCheck, off by default):
 *
 * 1. per repository, the open merge request links are grouped by merge request and judged from the database;
 * 2. a merge request is taken to GitStation only when its head commit is due to be read (new, changed since, or
 *    not read for HEAD_RECHECK_MS) or the judgement differs from what was last reported (git_acceptance_report);
 * 3. at most MAX_MRS_PER_TICK merge requests per tick, one per repository in turn — the repository served longest
 *    ago first — so a repository that cannot be asked, or has many merge requests, does not hold up the others;
 * 4. the repository is checked to be bound to this Kanflow project (`locate`), the head commit is read, and the
 *    check is written on it — again after every push, because GitStation counts a check on the current head only.
 *
 * Confidential PBIs (D-5): a merge request linked to one — live or deleted — is not reported at all. No check run,
 * no text; an earlier report stays as it was. Confidentiality is read at use time: when the tick plans, and once
 * more right before the report is sent. The summary of the other merge requests names PBIs by key only.
 *
 * A failure never reaches the sync: it is stored on the merge request's row (shown in the Git settings), logged,
 * and tried again — the next tick the first time, then after a growing wait (retryDelayMs), or after
 * PERMANENT_RETRY_MS for a refusal that does not go away by itself. A failure that is the repository's (report
 * refused, token refused, GitStation not reachable, not bound) makes all of its merge requests wait that long.
 */
const log = logger.child({ module: "git-acceptance" })

export const ACCEPTANCE_CHECK_NAME = "kanflow/acceptance"
/** The head commit is due to be read again after this long even when the links did not change (a push need not move them). */
export const HEAD_RECHECK_MS = 30 * 60_000
/** Merge requests taken to GitStation in one tick; the rest wait for the next one. */
export const MAX_MRS_PER_TICK = 30
/** A refusal that does not go away by itself (401 / 403 / 404) is not tried again before this; also the longest wait. */
export const PERMANENT_RETRY_MS = 60 * 60_000

const IID = /^[1-9]\d{0,14}$/
const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err))

export interface AcceptanceTickResult {
  /** Check runs written to GitStation. */
  reported: number
  /** Merge requests whose report is still right (nothing sent, or only the head commit read). */
  unchanged: number
  /** Merge requests whose read or report failed. */
  failed: number
  /** Merge requests left for a later tick (backing off, over the per-tick limit, their repository not to be asked, or changed while the tick ran). */
  waiting: number
}

/** The wait after `failures` consecutive failures: none after the first, then 10, 20, 40 min … at most PERMANENT_RETRY_MS. */
export function retryDelayMs(failures: number, permanent: boolean): number {
  if (permanent) return PERMANENT_RETRY_MS
  return failures <= 1 ? 0 : Math.min(PERMANENT_RETRY_MS, rereadBackoffMs(failures - 2))
}

function loadRepositories() {
  return prisma.gitRepository.findMany({
    where: { project: { deletedAt: null, gitIntegration: { enabled: true, provider: "gitstation", stationAcceptanceCheck: true } } },
    select: {
      id: true,
      projectId: true,
      apiBase: true,
      repoPath: true,
      externalId: true,
      tokenCipher: true,
      project: { select: { gitIntegration: { select: { tokenCipher: true, stationIntegrationId: true } } } },
    },
    orderBy: [{ projectId: "asc" }, { sortOrder: "asc" }],
  })
}
type Repository = Awaited<ReturnType<typeof loadRepositories>>[number]

interface Candidate {
  mrRef: string
  iid: number
  /** The PBIs the judgement was made from (asked again before the send). */
  pbiIds: string[]
  verdict: AcceptanceVerdict
  digest: string
  /** The links' latest occurredAt (the merge request's updated_at as the sync last saw it). */
  seenAt: Date
  row: GitAcceptanceReport | null
  /** When the merge request was last tried (0 = never): the longest-waiting go first. */
  lastTriedAt: number
}

/** A repository's merge requests to take to GitStation in this tick, in order. */
interface Queue {
  repo: Repository
  candidates: Candidate[]
  /** Index of the next candidate. */
  next: number
  /** When any of the repository's merge requests was last tried (0 = never): the repository served longest ago goes first. */
  lastServedAt: number
  /** Consecutive failures of the repository as a whole so far. */
  repositoryFailures: number
  session: Session | null
}

interface Plan {
  queue: Queue | null
  unchanged: number
  waiting: number
}

interface Session {
  client: GitStationClient
  stationProjectId: number
}

type RowData = Omit<Prisma.GitAcceptanceReportUncheckedCreateInput, "repositoryId" | "mrRef">
/** No failure on the row (after a success, or when the stored failure no longer applies). */
const NO_FAILURE = ACCEPTANCE_NO_FAILURE satisfies RowData

const triedAt = (row: GitAcceptanceReport) => Math.max(row.headCheckedAt?.getTime() ?? 0, row.lastErrorAt?.getTime() ?? 0)

/** What a report says, as one value: the same digest on the same head commit is not sent again. */
export function verdictDigest(verdict: AcceptanceVerdict): string {
  return createHash("sha256").update(`${verdict.conclusion}\n${verdict.summary}`).digest("hex")
}

/** Judges every open merge request of a repository from the database; no GitStation call. */
async function planRepository(repo: Repository, now: Date): Promise<Plan> {
  const links = await prisma.gitLink.findMany({
    where: { repositoryId: repo.id, kind: "mr", state: "opened" },
    select: { ref: true, backlogItemId: true, occurredAt: true },
  })
  const open = new Map<string, { pbiIds: Set<string>; seenAt: Date }>()
  for (const link of links) {
    if (!IID.test(link.ref)) continue
    const mr = open.get(link.ref) ?? { pbiIds: new Set<string>(), seenAt: link.occurredAt }
    mr.pbiIds.add(link.backlogItemId)
    if (link.occurredAt > mr.seenAt) mr.seenAt = link.occurredAt
    open.set(link.ref, mr)
  }
  // A merge request that is no longer open (or no longer linked) has nothing to compare with any more.
  await prisma.gitAcceptanceReport.deleteMany({ where: { repositoryId: repo.id, mrRef: { notIn: [...open.keys()] } } })
  const plan: Plan = { queue: null, unchanged: 0, waiting: 0 }
  if (open.size === 0) return plan

  const [pbis, rows] = await Promise.all([
    prisma.productBacklogItem.findMany({
      where: { id: { in: [...new Set(links.map((l) => l.backlogItemId))] }, projectId: repo.projectId },
      select: {
        id: true,
        displayId: true,
        deletedAt: true,
        confidential: true,
        sprintItems: { where: { sprint: { status: { in: [...OPEN_SPRINT_STATUSES] } } }, select: { id: true }, take: 1 },
        criteria: { where: { deletedAt: null }, select: { evidenceKind: true } },
      },
    }),
    prisma.gitAcceptanceReport.findMany({ where: { repositoryId: repo.id } }),
  ])
  const pbiById = new Map(pbis.map((p) => [p.id, p]))
  const rowByRef = new Map(rows.map((r) => [r.mrRef, r]))
  const repositoryWide = rows.filter((r) => r.repositoryWide)
  // The repository itself failed a moment ago: none of its merge requests is tried before that wait is over.
  const holds = (r: GitAcceptanceReport) => r.repositoryWide && r.retryAt !== null && r.retryAt > now
  const held = rows.some(holds)

  const candidates: Candidate[] = []
  /**
   * Rows whose stored failure no longer applies (nothing is to be sent for the merge request any more). A row that
   * carries the repository's wait keeps it: the failure was the repository's, and its other merge requests still wait.
   */
  const settled: string[] = []
  const settle = (row: GitAcceptanceReport | null) => {
    if (row?.lastError && !holds(row)) settled.push(row.id)
  }
  for (const [mrRef, mr] of open) {
    const row = rowByRef.get(mrRef) ?? null
    const linked = [...mr.pbiIds].map((id) => pbiById.get(id))
    // D-5: a confidential PBI (deleted or not) — or one that cannot be read — and nothing is said about this merge request.
    if (linked.some((p) => !p || p.confidential)) {
      settle(row)
      continue
    }
    const verdict = evaluateAcceptance(
      linked.flatMap((p) => (p && !p.deletedAt ? [{ displayId: p.displayId, inOpenSprint: p.sprintItems.length > 0, evidenceKinds: p.criteria.map((c) => c.evidenceKind) }] : [])),
    )
    const digest = verdictDigest(verdict)
    const headDue = !row?.headCheckedAt || now.getTime() - row.headCheckedAt.getTime() >= HEAD_RECHECK_MS || !row.mrSeenAt || row.mrSeenAt < mr.seenAt
    // Head commit known and current: only a different judgement is news. (No head commit = the merge request had none to report on.)
    if (row && !headDue && (row.headSha === null || row.digest === digest)) {
      plan.unchanged++
      settle(row)
      continue
    }
    if (held || (row?.retryAt && row.retryAt > now)) {
      plan.waiting++
      continue
    }
    candidates.push({ mrRef, iid: Number(mrRef), pbiIds: [...mr.pbiIds], verdict, digest, seenAt: mr.seenAt, row, lastTriedAt: row ? triedAt(row) : 0 })
  }
  if (settled.length > 0) await prisma.gitAcceptanceReport.updateMany({ where: { id: { in: settled } }, data: NO_FAILURE })
  if (candidates.length > 0) {
    candidates.sort((a, b) => a.lastTriedAt - b.lastTriedAt)
    plan.queue = {
      repo,
      candidates,
      next: 0,
      lastServedAt: Math.max(0, ...rows.map(triedAt)),
      repositoryFailures: Math.max(0, ...repositoryWide.map((r) => r.failures)),
      session: null,
    }
  }
  return plan
}

/**
 * Writes the merge request's row — unless the check is no longer in effect for the project. The settings change
 * that ends it deletes the project's rows after updating the same git_integration row (git.service
 * updateGitSettings), so under this row lock a tick still running cannot bring a row back.
 */
async function save(repo: Repository, mrRef: string, data: RowData): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const [integration] = await tx.$queryRaw<AcceptanceSwitch[]>`
      SELECT "enabled", "provider", "stationAcceptanceCheck" FROM "git_integration" WHERE "projectId" = ${repo.projectId} FOR SHARE`
    if (!acceptanceCheckInEffect(integration)) return false
    await tx.gitAcceptanceReport.upsert({
      where: { repositoryId_mrRef: { repositoryId: repo.id, mrRef } },
      create: { repositoryId: repo.id, mrRef, ...data },
      update: data,
    })
    return true
  })
}

/**
 * Asked right before the send, because the plan may be minutes old by then (D-5: confidentiality is decided at use
 * time): the check is still in effect, the merge request is still linked to exactly the PBIs that were judged, and
 * every one of them is still this project's and not confidential.
 */
async function stillReportable(repo: Repository, c: Candidate): Promise<boolean> {
  const [integration, links, readable] = await Promise.all([
    prisma.gitIntegration.findUnique({ where: { projectId: repo.projectId }, select: { enabled: true, provider: true, stationAcceptanceCheck: true } }),
    prisma.gitLink.findMany({ where: { repositoryId: repo.id, kind: "mr", state: "opened", ref: c.mrRef }, select: { backlogItemId: true } }),
    prisma.productBacklogItem.count({ where: { id: { in: c.pbiIds }, projectId: repo.projectId, confidential: false } }),
  ])
  if (!acceptanceCheckInEffect(integration)) return false
  const linked = new Set(links.map((l) => l.backlogItemId))
  return linked.size === c.pbiIds.length && c.pbiIds.every((id) => linked.has(id)) && readable === c.pbiIds.length
}

type Stage = "read" | "report"

/** A GitStation call that failed, with the step it failed in: a 403 / 404 on the report means something else than on the read. */
class StationCallError extends Error {
  constructor(
    readonly stage: Stage,
    cause: unknown,
  ) {
    super(`gitstation ${stage} failed`, { cause })
    this.name = "StationCallError"
  }
}

async function stationCall<T>(stage: Stage, call: () => Promise<T>): Promise<T> {
  try {
    return await call()
  } catch (err) {
    throw new StationCallError(stage, err)
  }
}

/** One merge request: read its head commit, write the check when the commit or the judgement changed. */
async function reportOne(repo: Repository, c: Candidate, session: Session, now: Date): Promise<"reported" | "unchanged" | "waiting"> {
  // Always read first: the check goes on the head commit as it is now, never on one remembered from an earlier tick.
  const mr = await stationCall("read", () => session.client.getMergeRequest(session.stationProjectId, c.iid))
  const headSha = mr.state === "open" && isObjectId(mr.head_sha) ? mr.head_sha : null
  if (headSha === null) {
    // Not open in GitStation any more (the feed has not said so yet), or no head commit: there is nothing to report on.
    await save(repo, c.mrRef, { mrSeenAt: c.seenAt, headCheckedAt: now, headSha: null, conclusion: null, digest: null, reportedAt: null, ...NO_FAILURE })
    return "unchanged"
  }
  if (c.row && headSha === c.row.headSha && c.digest === c.row.digest) {
    // The whole row, not only the dates: were the row deleted meanwhile (the check switched off and on again), the
    // row written here still says what was reported.
    await save(repo, c.mrRef, { mrSeenAt: c.seenAt, headCheckedAt: now, headSha, conclusion: c.row.conclusion, digest: c.row.digest, reportedAt: c.row.reportedAt, ...NO_FAILURE })
    return "unchanged"
  }
  if (!(await stillReportable(repo, c))) return "waiting"
  await stationCall("report", () => session.client.reportCheck(session.stationProjectId, headSha, { name: ACCEPTANCE_CHECK_NAME, conclusion: c.verdict.conclusion, summary: c.verdict.summary }))
  try {
    await save(repo, c.mrRef, { mrSeenAt: c.seenAt, headCheckedAt: now, headSha, conclusion: c.verdict.conclusion, digest: c.digest, reportedAt: now, ...NO_FAILURE })
  } catch (err) {
    // The check is in GitStation; only Kanflow's note of it is missing. The next tick sends it again (GitStation overwrites).
    log.error("acceptance check reported but not recorded", { repositoryId: repo.id, mrRef: c.mrRef, error: err })
  }
  return "reported"
}

interface FailureInfo {
  message: string
  /** Does not go away by itself: not tried again before PERMANENT_RETRY_MS. */
  permanent: boolean
  /** The same answer would come for every merge request of the repository: all of them wait. */
  repositoryWide: boolean
  log: Record<string, unknown>
}

/** Answers that are about the service account or GitStation as a whole, not about one merge request. */
const REPOSITORY_WIDE_KINDS: ReadonlySet<GitStationErrorKind> = new Set<GitStationErrorKind>(["auth", "forbidden", "rate_limited", "unavailable", "network", "host_not_allowed"])

function describeCallFailure(stage: Stage, err: GitStationError): FailureInfo {
  const logged = { stage, errorKind: err.kind, status: err.status, errorCode: err.detail.errorCode, reason: err.detail.reason }
  // 404 on the report: the commit read a moment ago is not reachable (FG-REPO-0023) — the head is read again next time.
  if (stage === "report" && err.kind === "not_found") return { message: ACCEPTANCE_COMMIT_MISSING_MESSAGE, permanent: false, repositoryWide: false, log: logged }
  // 403 on the report: the check namespace is not granted to the service account, or it is below Developer (FG-AUTH-0003).
  if (stage === "report" && err.kind === "forbidden") return { message: ACCEPTANCE_REPORT_REFUSED_MESSAGE, permanent: true, repositoryWide: true, log: logged }
  return { message: gitStationErrorMessage(err), permanent: isPermanentFailure(err), repositoryWide: REPOSITORY_WIDE_KINDS.has(err.kind), log: logged }
}

/** The repository could not be asked at all (GitStation's answer, or it is not bound to this project alone). */
function describeConnectFailure(err: unknown): FailureInfo | null {
  if (!(err instanceof GitStationError || err instanceof NotBoundError || err instanceof MissingIntegrationError)) return null
  const station = err instanceof GitStationError ? err : null
  return {
    message: gitStationErrorMessage(err),
    permanent: isPermanentFailure(err),
    repositoryWide: true,
    log: { stage: "connect", errorKind: station?.kind ?? err.name, status: station?.status, errorCode: station?.detail.errorCode },
  }
}

/** Stores a failure on the merge request's row. Never throws: a failure that cannot be stored is logged and tried again next tick. */
async function storeFailure(q: Queue, c: Candidate, info: FailureInfo, now: Date): Promise<void> {
  const failures = info.repositoryWide ? q.repositoryFailures + 1 : (c.row && !c.row.repositoryWide ? c.row.failures : 0) + 1
  if (info.repositoryWide) q.repositoryFailures = failures
  const delay = retryDelayMs(failures, info.permanent)
  try {
    await save(q.repo, c.mrRef, {
      lastError: info.message.slice(0, 500),
      lastErrorAt: now,
      retryAt: delay > 0 ? new Date(now.getTime() + delay) : null,
      failures,
      repositoryWide: info.repositoryWide,
    })
  } catch (err) {
    log.error("acceptance check failure not stored", { repositoryId: q.repo.id, mrRef: c.mrRef, message: info.message, ...info.log, error: err })
  }
}

/** Token, binding to this Kanflow project, client. Null = no readable token (logged here; the sync shows it; nothing is asked). */
async function connect(repo: Repository, clients: DevClients): Promise<Session | null> {
  const integration = repo.project.gitIntegration
  let token: string | null = null
  let unreadable: string | undefined
  try {
    token = integration ? repositoryToken(repo, integration) : null
  } catch (err) {
    unreadable = errorText(err)
  }
  if (!integration || !token) {
    log.warn("acceptance check skipped: no readable token", { repositoryId: repo.id, ...(unreadable !== undefined ? { error: unreadable } : {}) })
    return null
  }
  const connection: DevConnection = { repositoryId: repo.id, projectId: repo.projectId, apiBase: repo.apiBase, repoPath: repo.repoPath, externalId: repo.externalId, token, stationIntegrationId: integration.stationIntegrationId }
  // Bound in GitStation to exactly this Kanflow project: PBI keys never go to a repository of another project.
  const stationProjectId = await createGitStationSource(connection, clients.gitstation).locate()
  return { client: stationClientFor(connection, clients.gitstation), stationProjectId }
}

/**
 * The repository's next merge request. False = the repository leaves this tick's rotation: nothing left, or it
 * cannot be asked (its other merge requests wait).
 */
async function takeTurn(q: Queue, clients: DevClients, now: Date, total: AcceptanceTickResult): Promise<boolean> {
  const c = q.candidates[q.next]
  if (!q.session) {
    try {
      q.session = await connect(q.repo, clients)
    } catch (err) {
      const info = describeConnectFailure(err)
      if (!info) throw err
      q.next++
      total.failed++
      log.warn("acceptance check skipped: repository not readable", { repositoryId: q.repo.id, ...info.log })
      await storeFailure(q, c, info, now)
      return false
    }
    if (!q.session) return false
  }
  q.next++
  try {
    total[await reportOne(q.repo, c, q.session, now)]++
  } catch (err) {
    total.failed++
    const call = err instanceof StationCallError ? err : null
    const info = call && call.cause instanceof GitStationError ? describeCallFailure(call.stage, call.cause) : null
    if (!info) {
      // Not GitStation's answer (the database, a bug): nothing to tell the project; the merge request is tried again next tick.
      // The cause itself goes to the log (the logger keeps an error's name, message and stack, not its `cause`).
      log.error("acceptance check failed", { repositoryId: q.repo.id, mrRef: c.mrRef, stage: call?.stage ?? "internal", error: call ? call.cause : err })
    } else {
      log.warn("acceptance check not reported", { repositoryId: q.repo.id, mrRef: c.mrRef, ...info.log })
      await storeFailure(q, c, info, now)
      if (info.repositoryWide) return false
    }
  }
  return q.next < q.candidates.length
}

/** One pass (poller tick). Never throws for a repository's failure; a failure of the pass itself is the caller's to log. */
export async function reportAcceptanceChecks(clients: DevClients = {}, now = new Date()): Promise<AcceptanceTickResult> {
  const total: AcceptanceTickResult = { reported: 0, unchanged: 0, failed: 0, waiting: 0 }
  const repos = await loadRepositories()
  let rotation: Queue[] = []
  for (const repo of repos) {
    try {
      const plan = await planRepository(repo, now)
      if (plan.queue) rotation.push(plan.queue)
      total.unchanged += plan.unchanged
      total.waiting += plan.waiting
    } catch (err) {
      log.error("acceptance check planning failed", { repositoryId: repo.id, error: err })
    }
  }
  rotation.sort((a, b) => a.lastServedAt - b.lastServedAt)

  // One merge request per repository in turn, until the tick's limit: no repository can use up the tick alone.
  let budget = MAX_MRS_PER_TICK
  while (budget > 0 && rotation.length > 0) {
    const staying: Queue[] = []
    for (const q of rotation) {
      if (budget === 0) {
        staying.push(q)
        continue
      }
      const before = q.next
      let stays = false
      try {
        stays = await takeTurn(q, clients, now, total)
      } catch (err) {
        log.error("acceptance check failed", { repositoryId: q.repo.id, error: err })
      }
      budget -= q.next - before
      if (stays) staying.push(q)
      else total.waiting += q.candidates.length - q.next
    }
    rotation = staying
  }
  for (const q of rotation) total.waiting += q.candidates.length - q.next
  if (total.reported > 0 || total.failed > 0) log.info("acceptance checks reported", { ...total })
  return total
}
