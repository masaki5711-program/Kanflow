import { randomUUID } from "node:crypto"
import type { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { keyedDigest } from "@/lib/secret-box"
import { CURSOR_INVALID_MESSAGE, STATION_HELD_MESSAGE, STATION_QUARANTINED_MESSAGE } from "@/lib/git/sync-messages"
import { GitStationError } from "@/lib/git/gitstation-client"
import type { DevClients, DevConnection, DevSource } from "./dev-source"
import { fail, failureMessage, MISSING_TOKEN_MESSAGE, repositoryToken, withBranches, writeRead, type SyncIntegration, type SyncRepositoryRow, type SyncResult } from "./git-sync"
import {
  createGitStationSource,
  describeGitStationError,
  gitStationCursorCodec,
  type HeadResolver,
  MISSING_INTEGRATION_MESSAGE,
  MissingIntegrationError,
  NotBoundError,
  readFeed,
  routeFeed,
  stationClientFor,
} from "./gitstation-source"

/**
 * The GitStation feed sync (plan 11 K3, plan 12 §2.4): ONE cursor per GitStation integration as
 * one service-account token sees it (git_station_feed), not one per repository. A read:
 *
 * 1. takes the feed's lease (one reader per feed: the poller, 今すぐ同期 and プロジェクトの同期 never
 *    overlap, so a merge is never written — or notified — twice);
 * 2. checks every repository is still bound in GitStation to its own Kanflow project (`locate`);
 * 3. reads the feed ONCE from the cursor (re-reading the state of repositories new to the feed or
 *    marked for it), routes each event to its repository by GitStation's project id (bound in step 2
 *    to this Kanflow project only), and writes every repository through the same code as the GitLab sync;
 * 4. saves the cursor as a compare-and-set on (generation, previous cursor, lease), then the
 *    repository statuses, then runs the notifications / auto-complete.
 *
 * The cursor is HELD (not moved) only for transient failures (network, timeout, 429, 503, unexpected
 * answers) of a repository's check or write: re-reading is idempotent, and every repository shows the
 * hold. A permanent failure (not bound, 401 / 403 / 404, host not allowed) or a repository that could
 * not be written 3 times in a row is skipped (logged with the number of its events) and marked, so its
 * state is re-read once it works again — it never stalls the shared feed, and its events are never
 * silently lost. The lease is renewed between phases; a read that lost it stops writing.
 *
 * Why above the per-repository DevSource and not inside it: the feed spans up to 200 bound
 * repositories, so reading it once per repository would re-read the same events N times, and N
 * cursors over one feed could drift apart. The DevSource contract (codec, readChanges, branches,
 * tags, errors) is kept: gitstation-source implements it.
 */
const log = logger.child({ module: "git-sync" })

/** A read holds its feed at most this long; a crashed reader's lease expires. */
const LEASE_MS = 10 * 60_000

export const HELD_MESSAGE = STATION_HELD_MESSAGE
/** Consecutive write failures after which a repository is set aside (the cursor no longer waits for it). */
export const QUARANTINE_AFTER = 3
/** Consecutive held reads after which the hold is logged as an error. */
const HOLD_ESCALATE_AFTER = 3
/** Consecutive busy results (per feed, per process) after which they are logged as a warning. */
const BUSY_WARN_AFTER = 3
const REREAD_BACKOFF_BASE_MS = 10 * 60_000
const REREAD_BACKOFF_CAP_MS = 24 * 60 * 60_000

/** Which token a feed belongs to: an HMAC under the server key (a database dump cannot test token guesses). */
export function tokenFingerprint(token: string): string {
  return keyedDigest(`gitstation-feed:${token}`).slice(0, 32)
}

interface FeedMember {
  repo: SyncRepositoryRow
  integration: SyncIntegration
  token: string
}

interface FeedKey {
  apiBase: string
  integrationId: string
  tokenFingerprint: string
}

interface FeedGroup {
  key: FeedKey
  token: string
  members: FeedMember[]
}

interface InvalidMember {
  repo: SyncRepositoryRow
  kind: string
  message: string
}

const keyString = (k: FeedKey) => `${k.apiBase}|${k.integrationId}|${k.tokenFingerprint}`
const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err))

function connection(m: FeedMember): DevConnection {
  return {
    repositoryId: m.repo.id,
    projectId: m.repo.projectId,
    apiBase: m.repo.apiBase,
    repoPath: m.repo.repoPath,
    externalId: m.repo.externalId,
    token: m.token,
    stationIntegrationId: m.integration.stationIntegrationId,
  }
}

/** Repositories of enabled, live projects that read GitStation. */
function loadRepositories(where: { projectId?: string } = {}) {
  return prisma.gitRepository.findMany({
    where: { ...where, project: { deletedAt: null, gitIntegration: { enabled: true, provider: "gitstation" } } },
    include: { project: { select: { deletedAt: true, gitIntegration: true } } },
    orderBy: [{ projectId: "asc" }, { sortOrder: "asc" }],
  })
}

/** Groups repositories by feed (pure); a repository without a readable token or integration id cannot join one. */
function groupByFeed(repos: SyncRepositoryRow[]): { groups: FeedGroup[]; invalid: InvalidMember[] } {
  const groups = new Map<string, FeedGroup>()
  const invalid: InvalidMember[] = []
  for (const repo of repos) {
    const integration = repo.project.gitIntegration
    if (!integration) continue
    const integrationId = integration.stationIntegrationId?.trim()
    if (!integrationId) {
      invalid.push({ repo, kind: "integration", message: MISSING_INTEGRATION_MESSAGE })
      continue
    }
    let key: FeedKey
    let token: string | null
    try {
      token = repositoryToken(repo, integration)
      key = { apiBase: repo.apiBase, integrationId, tokenFingerprint: token ? tokenFingerprint(token) : "" }
    } catch (err) {
      log.error("git token unreadable", { repositoryId: repo.id, error: errorText(err) })
      token = null
      key = { apiBase: "", integrationId: "", tokenFingerprint: "" }
    }
    if (!token) {
      invalid.push({ repo, kind: "token", message: MISSING_TOKEN_MESSAGE })
      continue
    }
    const group = groups.get(keyString(key)) ?? { key, token, members: [] }
    group.members.push({ repo, integration, token })
    groups.set(keyString(key), group)
  }
  return { groups: [...groups.values()], invalid }
}

/** Busy results per feed in this process (the log escalates when a feed stays busy). */
const busyCounts = new Map<string, number>()

async function acquireLease(feedId: string): Promise<string | null> {
  const owner = randomUUID()
  const now = new Date()
  const r = await prisma.gitStationFeed.updateMany({
    where: { id: feedId, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
    data: { leaseOwner: owner, leaseUntil: new Date(now.getTime() + LEASE_MS) },
  })
  return r.count === 1 ? owner : null
}

/** Extends this read's lease; false = it was lost (expired and taken, or the row changed): stop writing. */
async function renewLease(feedId: string, owner: string): Promise<boolean> {
  const r = await prisma.gitStationFeed.updateMany({ where: { id: feedId, leaseOwner: owner }, data: { leaseUntil: new Date(Date.now() + LEASE_MS) } })
  return r.count === 1
}

async function releaseLease(feedId: string, owner: string): Promise<void> {
  await prisma.gitStationFeed
    .updateMany({ where: { id: feedId, leaseOwner: owner }, data: { leaseOwner: null, leaseUntil: null } })
    .catch((err: unknown) => log.error("gitstation feed lease not released", { feedId, error: errorText(err) }))
}

/**
 * A failure that will not go away by reading again (not bound, 401 / 403 / 404, host not allowed, no
 * integration id): the repository is skipped and marked, and the shared cursor moves on. Anything
 * else (network, timeout, 429, 503, invalid_response …) is transient: the cursor is held.
 */
export function isPermanentFailure(err: unknown): boolean {
  if (err instanceof NotBoundError || err instanceof MissingIntegrationError) return true
  return err instanceof GitStationError && (err.kind === "auth" || err.kind === "forbidden" || err.kind === "not_found" || err.kind === "host_not_allowed")
}

/** Next state re-read after `failures` consecutive failed ones: 10 min, 20 min, 40 min … at most a day. */
export function rereadBackoffMs(failures: number): number {
  return Math.min(REREAD_BACKOFF_CAP_MS, REREAD_BACKOFF_BASE_MS * 2 ** Math.max(0, failures))
}

/** A repository's failure as a result and the status to store (logged here, stored by the caller). */
function failure(repositoryId: string, source: Pick<DevSource, "describeError"> | null, err: unknown, now: Date) {
  const info = source ? source.describeError(err) : describeGitStationError(err)
  if (info.expected) log.warn("git sync listing failed", { repositoryId, kind: "feed", errorKind: info.kind, status: info.status })
  else log.error("git sync failed", { repositoryId, error: errorText(err) })
  return { result: { repositoryId, ok: false, links: 0, error: info.kind } as SyncResult, status: { lastError: info.message.slice(0, 500), lastErrorAt: now } }
}

type Feed = Awaited<ReturnType<typeof prisma.gitStationFeed.upsert>>

/** Merge requests a head lookup returns per checked commit (a commit is the head of one MR, rarely a few). */
const MAX_IIDS_PER_HEAD = 5
/** Open merge requests without a stored head read per project and check read (they are then stored with one). */
export const MAX_HEADLESS_PER_READ = 10

const asIid = (ref: string): number | null => {
  const iid = Number(ref)
  return Number.isSafeInteger(iid) && iid > 0 ? iid : null
}

/**
 * N2 (check.completed): among the repositories of this read bound to that GitStation project (located in this read:
 * never another project's), the open merge request links whose stored head is one of the checked commits — and, up
 * to MAX_HEADLESS_PER_READ, open links with no stored head yet (links older than the head column, or stored before
 * GitStation recorded a version): reading them stores their head, so no check waits for an unrelated event.
 * The distinct key ignores the repository on purpose: the answer is an iid list per head of ONE GitStation project.
 */
export function storedHeads(bound: readonly { repositoryId: string; stationProjectId: number }[]): HeadResolver {
  return async (stationProjectId, heads) => {
    const repositoryIds = bound.filter((b) => b.stationProjectId === stationProjectId).map((b) => b.repositoryId)
    const byHead = new Map<string, number[]>()
    if (repositoryIds.length === 0 || heads.length === 0) return { byHead, headless: [] }
    const open = { repositoryId: { in: repositoryIds }, kind: "mr", state: { in: ["opened", "locked"] } }
    // Bounded by the read's own repositories and the checked heads; the per-head cap is applied below.
    const rows = await prisma.gitLink.findMany({
      where: { ...open, headSha: { in: [...heads] } },
      select: { ref: true, headSha: true },
      distinct: ["headSha", "ref"],
      orderBy: [{ headSha: "asc" }, { ref: "asc" }],
    })
    for (const r of rows) {
      const iid = asIid(r.ref)
      if (!r.headSha || iid === null) continue
      const iids = byHead.get(r.headSha) ?? []
      if (!iids.includes(iid) && iids.length < MAX_IIDS_PER_HEAD) byHead.set(r.headSha, [...iids, iid])
    }
    const headlessRows = await prisma.gitLink.findMany({
      where: { ...open, headSha: null },
      select: { ref: true },
      distinct: ["ref"],
      orderBy: [{ occurredAt: "desc" }, { ref: "asc" }],
      take: MAX_HEADLESS_PER_READ,
    })
    const headless = headlessRows.map((r) => asIid(r.ref)).filter((iid): iid is number => iid !== null)
    return { byHead, headless }
  }
}

/** One feed, read once under its lease. Never throws: a failure is every member's result. */
async function syncFeed(group: FeedGroup, clients: DevClients, now: Date): Promise<SyncResult[]> {
  const repositoryIds = group.members.map((m) => m.repo.id)
  let feed: Feed | null = null
  let owner: string | null = null
  try {
    feed = await prisma.gitStationFeed.upsert({ where: { apiBase_integrationId_tokenFingerprint: group.key }, create: group.key, update: {} })
    owner = await acquireLease(feed.id)
    if (!owner) {
      const busy = (busyCounts.get(feed.id) ?? 0) + 1
      busyCounts.set(feed.id, busy)
      if (busy >= BUSY_WARN_AFTER) log.warn("gitstation feed busy: another read holds it", { feedId: feed.id, consecutive: busy })
      else log.info("gitstation feed busy: another read holds it", { feedId: feed.id, consecutive: busy })
      return repositoryIds.map((repositoryId) => ({ repositoryId, ok: false, links: 0, error: "busy" }))
    }
    busyCounts.delete(feed.id)
    return await readAndWrite(feed, owner, group, clients, now)
  } catch (err) {
    log.error("gitstation feed sync failed", { feedId: feed?.id ?? null, repositoryIds, error: errorText(err) })
    const results: SyncResult[] = []
    for (const id of repositoryIds) results.push(await fail(id, "http", "同期中にエラーが発生しました", now))
    return results
  } finally {
    if (feed && owner) await releaseLease(feed.id, owner)
  }
}

async function readAndWrite(feed: Feed, owner: string, group: FeedGroup, clients: DevClients, now: Date): Promise<SyncResult[]> {
  const context = { feedId: feed.id }
  const memberIds = group.members.map((m) => m.repo.id)
  const byId = new Map(group.members.map((m) => [m.repo.id, m]))
  const results = new Map<string, SyncResult>()
  const statuses = new Map<string, Record<string, unknown>>()
  /** Columns of git_repository stored with each status (re-read marks, write-failure counts). */
  const extras = new Map<string, Record<string, unknown>>()
  const finishes: (() => Promise<SyncResult>)[] = []
  /** Repositories that failed in a way that holds the cursor (their own status explains why). */
  const ownFailure = new Set<string>()

  const addExtra = (id: string, data: Record<string, unknown>) => extras.set(id, { ...(extras.get(id) ?? {}), ...data })
  const markReread = (id: string) => addExtra(id, { stationRereadAt: byId.get(id)?.repo.stationRereadAt ?? now })
  const resultsInOrder = () => memberIds.map((id) => results.get(id) ?? { repositoryId: id, ok: false, links: 0, error: "held" })
  const storeStatuses = async () => {
    const writes = [...new Set([...statuses.keys(), ...extras.keys()])].map((id) => prisma.gitRepository.update({ where: { id }, data: { ...(statuses.get(id) ?? {}), ...(extras.get(id) ?? {}) } }))
    if (writes.length > 0) await prisma.$transaction(writes)
  }
  const leaseLost = (phase: string) => {
    log.warn("gitstation feed lease lost: nothing more is written", { ...context, phase })
    return memberIds.map((id) => results.get(id) ?? { repositoryId: id, ok: false, links: 0, error: "lease_lost" })
  }
  /** Holds the cursor: every repository shows it (its own failure message where it has one). */
  const hold = async (reason: string) => {
    const holds = feed.consecutiveHolds + 1
    if (holds >= HOLD_ESCALATE_AFTER) log.error("gitstation feed cursor kept", { ...context, reason, consecutiveHolds: holds })
    else log.warn("gitstation feed cursor kept", { ...context, reason, consecutiveHolds: holds })
    if (!(await renewLease(feed.id, owner))) return leaseLost("hold")
    await prisma.gitStationFeed.update({ where: { id: feed.id }, data: { lastError: HELD_MESSAGE, lastErrorAt: now, consecutiveHolds: { increment: 1 } } })
    for (const id of memberIds) if (!ownFailure.has(id)) statuses.set(id, { lastError: HELD_MESSAGE, lastErrorAt: now })
    await storeStatuses()
    // Repositories already written keep their notifications / auto-complete (a re-read finds no change to trigger them again).
    for (const finish of finishes) await finish()
    return resultsInOrder()
  }

  // An unreadable stored position: every repository says so; nothing is read.
  let cursor
  try {
    cursor = gitStationCursorCodec.fromRow(feed, now)
  } catch (err) {
    log.error("git sync failed", { ...context, kind: "feed", repositoryIds: memberIds, error: errorText(err) })
    await prisma.gitStationFeed.update({ where: { id: feed.id }, data: { lastError: CURSOR_INVALID_MESSAGE, lastErrorAt: now } })
    for (const id of memberIds) {
      results.set(id, { repositoryId: id, ok: false, links: 0, error: "cursor" })
      statuses.set(id, { lastError: CURSOR_INVALID_MESSAGE, lastErrorAt: now })
    }
    await storeStatuses()
    return resultsInOrder()
  }

  let client
  try {
    client = stationClientFor({ apiBase: group.key.apiBase, token: group.token, stationIntegrationId: group.key.integrationId }, clients.gitstation)
  } catch (err) {
    for (const m of group.members) {
      const f = failure(m.repo.id, null, err, now)
      results.set(m.repo.id, f.result)
      statuses.set(m.repo.id, f.status)
      ownFailure.add(m.repo.id)
    }
    return hold("client")
  }

  // Binding check. A permanent failure (not bound, 401 / 403 / 404 …): skipped and marked — its state
  // is re-read when it works again — and the cursor moves on. A transient one: the cursor is held.
  const bound: { m: FeedMember; source: DevSource; stationProjectId: number }[] = []
  const skipped: FeedMember[] = []
  let held = false
  for (const m of group.members) {
    const source = createGitStationSource(connection(m), clients.gitstation)
    try {
      bound.push({ m, source, stationProjectId: await source.locate() })
    } catch (err) {
      const f = failure(m.repo.id, source, err, now)
      results.set(m.repo.id, f.result)
      statuses.set(m.repo.id, f.status)
      if (isPermanentFailure(err)) {
        skipped.push(m)
        markReread(m.repo.id)
      } else {
        ownFailure.add(m.repo.id)
        held = true
      }
    }
  }
  if (held) return hold("a repository could not be checked")
  if (!(await renewLease(feed.id, owner))) return leaseLost("after binding checks")

  const due = (m: FeedMember) => (m.repo.syncedAt === null || m.repo.stationRereadAt !== null) && (m.repo.stationRereadNextAt === null || m.repo.stationRereadNextAt <= now)
  const reread = bound.filter(({ m }) => due(m)).map((b) => b.stationProjectId)
  const read = await readFeed(client, cursor, bound.map((b) => b.stationProjectId), context, reread, feed.consecutiveHolds, storedHeads(bound.map((b) => ({ repositoryId: b.m.repo.id, stationProjectId: b.stationProjectId }))))
  if (read.restarted) log.info("gitstation state re-read", { ...context, reason: read.restarted, repositories: bound.length })
  // Skipped repositories are not located: nothing is routed to them (their state is re-read once they work).
  const routed = routeFeed(
    read,
    [
      ...bound.map((b) => ({ id: b.m.repo.id, repoPath: b.m.repo.repoPath, projectId: b.m.repo.projectId, stationProjectId: b.stationProjectId })),
      ...skipped.map((m) => ({ id: m.repo.id, repoPath: m.repo.repoPath, projectId: m.repo.projectId, stationProjectId: null })),
    ],
    context,
  )
  for (const m of skipped) log.warn("gitstation repository skipped", { ...context, repositoryId: m.repo.id, error: results.get(m.repo.id)?.error, skippedEvents: routed.eventCounts.get(m.repo.id) ?? 0 })
  if (!(await renewLease(feed.id, owner))) return leaseLost("after feed read")

  for (const { m, source, stationProjectId } of bound) {
    if (!(await renewLease(feed.id, owner))) return leaseLost("before repository write")
    const id = m.repo.id
    try {
      const changes = routed.changes.get(id)!
      const written = await writeRead(m.repo, m.integration, "gitstation", source, await withBranches(source, changes, now), now)
      statuses.set(id, written.status)
      finishes.push(async () => {
        const r = await written.finish()
        results.set(id, r)
        return r
      })
      addExtra(id, { stationWriteFailures: 0 })
      const rereadFailure = read.rereadFailures.get(stationProjectId)
      if (rereadFailure !== undefined) {
        const failures = m.repo.stationRereadFailures + 1
        addExtra(id, { stationRereadAt: m.repo.stationRereadAt ?? now, stationRereadFailures: failures, stationRereadNextAt: new Date(now.getTime() + rereadBackoffMs(failures - 1)) })
        log.warn("gitstation state re-read failed", { ...context, repositoryId: id, consecutiveFailures: failures, nextAttemptInMs: rereadBackoffMs(failures - 1) })
      } else if (read.snapshots.has(stationProjectId)) addExtra(id, { stationRereadAt: null, stationRereadFailures: 0, stationRereadNextAt: null })
      results.set(id, { repositoryId: id, ok: changes.failures.length === 0, links: 0 })
    } catch (err) {
      const f = failure(id, source, err, now)
      results.set(id, f.result)
      const failures = m.repo.stationWriteFailures + 1
      addExtra(id, { stationWriteFailures: failures })
      if (failures >= QUARANTINE_AFTER) {
        // Set aside: it keeps failing; the others go on and its state is re-read later.
        log.error("gitstation repository quarantined", { ...context, repositoryId: id, consecutiveWriteFailures: failures, skippedEvents: routed.eventCounts.get(id) ?? 0 })
        statuses.set(id, { lastError: STATION_QUARANTINED_MESSAGE, lastErrorAt: now })
        markReread(id)
      } else {
        statuses.set(id, f.status)
        ownFailure.add(id)
        held = true
      }
    }
  }
  if (held) return hold("a repository could not be written")

  // Compare-and-set: only from the position this read started at, under this read's lease and generation.
  const feedStatus =
    read.failures.length > 0
      ? { lastError: failureMessage(read.failures, bound[0]?.source ?? createGitStationSource(connection(group.members[0]), clients.gitstation)).slice(0, 500), lastErrorAt: now }
      : { readAt: now, lastError: null, lastErrorAt: null }
  // A read that failed without moving (feed down, a follow-up read failing for now) is a hold too: counted and escalated.
  const stalled = read.failures.length > 0 && read.cursor === read.start
  if (stalled) {
    const holds = feed.consecutiveHolds + 1
    const fields = { ...context, reason: "feed read failed", consecutiveHolds: holds }
    if (holds >= HOLD_ESCALATE_AFTER) log.error("gitstation feed cursor kept", fields)
    else log.warn("gitstation feed cursor kept", fields)
  }
  const saved = await prisma.gitStationFeed.updateMany({
    where: { id: feed.id, generation: feed.generation, cursor: feed.cursor, leaseOwner: owner },
    data: { ...gitStationCursorCodec.toRow(read.cursor), ...feedStatus, consecutiveHolds: stalled ? { increment: 1 } : 0 },
  })
  if (saved.count === 0) {
    const now2 = await prisma.gitStationFeed.findUnique({ where: { id: feed.id }, select: { generation: true, cursor: true, leaseOwner: true } })
    const mismatched = !now2 ? ["row"] : [now2.generation !== feed.generation && "generation", now2.cursor !== feed.cursor && "cursor", now2.leaseOwner !== owner && "lease"].filter(Boolean)
    log.warn("gitstation feed cursor not saved: nothing more is written", { ...context, mismatched })
    return memberIds.map((id) => results.get(id) ?? { repositoryId: id, ok: false, links: 0, error: "lease_lost" })
  }
  await storeStatuses()
  for (const finish of finishes) await finish()
  return resultsInOrder()
}

/** Reads every feed that has a selected repository (all its repositories are written); returns the selected repositories' results. */
async function syncSelected(selected: (repo: SyncRepositoryRow) => boolean, clients: DevClients, now: Date): Promise<SyncResult[]> {
  const { groups, invalid } = groupByFeed(await loadRepositories())
  const results: SyncResult[] = []
  for (const i of invalid.filter((x) => selected(x.repo))) {
    results.push(await fail(i.repo.id, i.kind, i.message, now))
    // Out of its feed until fixed: its state is re-read once it can join again.
    await prisma.gitRepository.updateMany({ where: { id: i.repo.id, stationRereadAt: null }, data: { stationRereadAt: now } })
  }
  for (const group of groups.filter((g) => g.members.some((m) => selected(m.repo)))) {
    const ids = new Set(group.members.filter((m) => selected(m.repo)).map((m) => m.repo.id))
    results.push(...(await syncFeed(group, clients, now)).filter((r) => ids.has(r.repositoryId)))
  }
  return results
}

/** The poller's GitStation pass: every feed once. */
export function syncGitStationFeeds(clients: DevClients = {}, now = new Date()): Promise<SyncResult[]> {
  return syncSelected(() => true, clients, now)
}

/** プロジェクトの同期 (今すぐ同期 of a project): each of its feeds is read once. */
export function syncFeedsOfProject(projectId: string, clients: DevClients = {}, now = new Date()): Promise<SyncResult[]> {
  return syncSelected((repo) => repo.projectId === projectId, clients, now)
}

/** 今すぐ同期 of one GitStation repository: its whole feed is read (shared cursor); its own result is returned. */
export async function syncFeedOfRepository(repositoryId: string, clients: DevClients = {}, now = new Date()): Promise<SyncResult> {
  const [own] = await syncSelected((repo) => repo.id === repositoryId, clients, now)
  return own ?? { repositoryId, ok: false, links: 0, error: "disabled" }
}

/**
 * 過去分を再同期 of a GitStation repository: its feed restarts (head cursor, state re-read, then the
 * feed from that head) and the generation moves, so a read already running does not write its
 * cursor back. Run inside the caller's transaction (with the repository's own generation bump).
 * Returns false when the repository cannot name a feed (no integration id, no readable token).
 */
export async function restartFeedOfRepository(repositoryId: string, db: Prisma.TransactionClient = prisma): Promise<boolean> {
  const repo = await db.gitRepository.findUnique({ where: { id: repositoryId }, include: { project: { select: { deletedAt: true, gitIntegration: true } } } })
  const integration = repo?.project.gitIntegration
  const integrationId = integration?.stationIntegrationId?.trim()
  if (!repo || !integration || !integrationId) return false
  let fingerprint: string
  try {
    const token = repositoryToken(repo, integration)
    if (!token) return false
    fingerprint = tokenFingerprint(token)
  } catch (err) {
    log.error("git token unreadable", { repositoryId, error: errorText(err) })
    return false
  }
  const key = { apiBase: repo.apiBase, integrationId, tokenFingerprint: fingerprint }
  const restart = gitStationCursorCodec.restart({}, new Date())
  await db.gitStationFeed.upsert({
    where: { apiBase_integrationId_tokenFingerprint: key },
    create: { ...key, ...restart },
    update: { ...restart, generation: { increment: 1 } },
  })
  return true
}
