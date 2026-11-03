import { randomUUID } from "node:crypto"
import type { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { keyedDigest } from "@/lib/secret-box"
import { CURSOR_INVALID_MESSAGE } from "@/lib/git/sync-messages"
import type { DevClients, DevConnection, DevSource } from "./dev-source"
import { fail, failureMessage, MISSING_TOKEN_MESSAGE, repositoryToken, withBranches, writeRead, type SyncIntegration, type SyncRepositoryRow, type SyncResult } from "./git-sync"
import {
  createGitStationSource,
  describeGitStationError,
  gitStationCursorCodec,
  MISSING_INTEGRATION_MESSAGE,
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
 *    marked for it), routes each event to its repository by path AND the repository's own Kanflow
 *    project in `work_items`, and writes every repository through the same code as the GitLab sync;
 * 4. saves the cursor as a compare-and-set on (generation, previous cursor, lease), then the
 *    repository statuses, then runs the notifications / auto-complete.
 *
 * The cursor is HELD (not moved) when any repository could not be checked or written: re-reading is
 * idempotent. A repository that is not bound is skipped (logged with the number of its events) and
 * marked, so its state is re-read when the binding returns — its events are never silently lost.
 *
 * Why above the per-repository DevSource and not inside it: the feed spans up to 200 bound
 * repositories, so reading it once per repository would re-read the same events N times, and N
 * cursors over one feed could drift apart. The DevSource contract (codec, readChanges, branches,
 * tags, errors) is kept: gitstation-source implements it.
 */
const log = logger.child({ module: "git-sync" })

/** A read holds its feed at most this long; a crashed reader's lease expires. */
const LEASE_MS = 10 * 60_000

export const HELD_MESSAGE = "リポジトリを確かめられない・書き込めないものがあったため、イベントの履歴の位置を進めていません。次回の同期でやり直します。"

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

async function acquireLease(feedId: string): Promise<string | null> {
  const owner = randomUUID()
  const now = new Date()
  const r = await prisma.gitStationFeed.updateMany({
    where: { id: feedId, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
    data: { leaseOwner: owner, leaseUntil: new Date(now.getTime() + LEASE_MS) },
  })
  return r.count === 1 ? owner : null
}

async function releaseLease(feedId: string, owner: string): Promise<void> {
  await prisma.gitStationFeed
    .updateMany({ where: { id: feedId, leaseOwner: owner }, data: { leaseOwner: null, leaseUntil: null } })
    .catch((err: unknown) => log.error("gitstation feed lease not released", { feedId, error: errorText(err) }))
}

/** A repository's failure as a result and the status to store (logged here, stored by the caller). */
function failure(repositoryId: string, source: Pick<DevSource, "describeError"> | null, err: unknown, now: Date) {
  const info = source ? source.describeError(err) : describeGitStationError(err)
  if (info.expected) log.warn("git sync listing failed", { repositoryId, kind: "feed", errorKind: info.kind, status: info.status })
  else log.error("git sync failed", { repositoryId, error: errorText(err) })
  return { result: { repositoryId, ok: false, links: 0, error: info.kind } as SyncResult, status: { lastError: info.message.slice(0, 500), lastErrorAt: now } }
}

type Feed = Awaited<ReturnType<typeof prisma.gitStationFeed.upsert>>

/** One feed, read once under its lease. Never throws: a failure is every member's result. */
async function syncFeed(group: FeedGroup, clients: DevClients, now: Date): Promise<SyncResult[]> {
  const repositoryIds = group.members.map((m) => m.repo.id)
  let feed: Feed | null = null
  let owner: string | null = null
  try {
    feed = await prisma.gitStationFeed.upsert({ where: { apiBase_integrationId_tokenFingerprint: group.key }, create: group.key, update: {} })
    owner = await acquireLease(feed.id)
    if (!owner) {
      log.info("gitstation feed busy: another read holds it", { feedId: feed.id })
      return repositoryIds.map((repositoryId) => ({ repositoryId, ok: false, links: 0, error: "busy" }))
    }
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
  const results = new Map<string, SyncResult>()
  const statuses = new Map<string, Record<string, unknown>>()
  const finishes: (() => Promise<SyncResult>)[] = []
  const rereadMarks = new Map<string, "set" | "failed" | "clear">()

  const storeStatuses = async () => {
    const writes = [...statuses].map(([id, data]) => {
      const mark = rereadMarks.get(id)
      const member = group.members.find((m) => m.repo.id === id)
      const reread =
        mark === "clear"
          ? { stationRereadAt: null, stationRereadFailures: 0 }
          : mark === "failed"
            ? { stationRereadAt: member?.repo.stationRereadAt ?? now, stationRereadFailures: { increment: 1 } }
            : mark === "set"
              ? { stationRereadAt: member?.repo.stationRereadAt ?? now }
              : {}
      return prisma.gitRepository.update({ where: { id }, data: { ...data, ...reread } })
    })
    if (writes.length > 0) await prisma.$transaction(writes)
  }
  const hold = async (reason: string) => {
    log.warn("gitstation feed cursor kept", { ...context, reason })
    await prisma.gitStationFeed.update({ where: { id: feed.id }, data: { lastError: HELD_MESSAGE, lastErrorAt: now } })
    await storeStatuses()
    // Repositories already written keep their notifications / auto-complete (a re-read finds no change to trigger them again).
    for (const finish of finishes) await finish()
    // Repositories not reached because the read was held: nothing written, nothing stored.
    return group.members.map((m) => results.get(m.repo.id) ?? { repositoryId: m.repo.id, ok: false, links: 0, error: "held" })
  }

  // An unreadable stored position: every repository says so; nothing is read.
  let cursor
  try {
    cursor = gitStationCursorCodec.fromRow(feed, now)
  } catch (err) {
    log.error("git sync failed", { ...context, kind: "feed", repositoryIds: group.members.map((m) => m.repo.id), error: errorText(err) })
    await prisma.gitStationFeed.update({ where: { id: feed.id }, data: { lastError: CURSOR_INVALID_MESSAGE, lastErrorAt: now } })
    for (const m of group.members) {
      results.set(m.repo.id, { repositoryId: m.repo.id, ok: false, links: 0, error: "cursor" })
      statuses.set(m.repo.id, { lastError: CURSOR_INVALID_MESSAGE, lastErrorAt: now })
    }
    await storeStatuses()
    return group.members.map((m) => results.get(m.repo.id)!)
  }

  let client
  try {
    client = stationClientFor({ apiBase: group.key.apiBase, token: group.token, stationIntegrationId: group.key.integrationId }, clients.gitstation)
  } catch (err) {
    for (const m of group.members) {
      const f = failure(m.repo.id, null, err, now)
      results.set(m.repo.id, f.result)
      statuses.set(m.repo.id, f.status)
    }
    return hold("client")
  }

  // Binding check. Not bound: skipped and marked (its state is re-read when the binding returns).
  // Anything else (GitStation down, 401 …): the cursor is held.
  const bound: { m: FeedMember; source: DevSource }[] = []
  const notBound: FeedMember[] = []
  let held = false
  for (const m of group.members) {
    const source = createGitStationSource(connection(m), clients.gitstation)
    try {
      await source.locate()
      bound.push({ m, source })
    } catch (err) {
      const f = failure(m.repo.id, source, err, now)
      results.set(m.repo.id, f.result)
      statuses.set(m.repo.id, f.status)
      if (err instanceof NotBoundError) {
        notBound.push(m)
        rereadMarks.set(m.repo.id, "set")
      } else held = true
    }
  }
  if (held) return hold("a repository could not be checked")

  const reread = bound.filter(({ m }) => m.repo.syncedAt === null || m.repo.stationRereadAt !== null).map(({ m }) => m.repo.repoPath)
  const read = await readFeed(client, cursor, bound.map(({ m }) => m.repo.repoPath), context, reread)
  if (read.restarted) log.info("gitstation state re-read", { ...context, reason: read.restarted, repositories: bound.length })
  const routed = routeFeed(
    read,
    [...bound.map(({ m }) => m), ...notBound].map((m) => ({ id: m.repo.id, repoPath: m.repo.repoPath, projectId: m.repo.projectId })),
    now,
    context,
  )
  for (const m of notBound) log.warn("gitstation repository skipped: not bound", { ...context, repositoryId: m.repo.id, skippedEvents: routed.eventCounts.get(m.repo.id) ?? 0 })

  for (const { m, source } of bound) {
    try {
      const changes = routed.changes.get(m.repo.id)!
      const written = await writeRead(m.repo, m.integration, "gitstation", source, await withBranches(source, changes, now), now)
      statuses.set(m.repo.id, written.status)
      finishes.push(async () => {
        const r = await written.finish()
        results.set(m.repo.id, r)
        return r
      })
      const path = m.repo.repoPath.toLowerCase()
      if (read.rereadFailures.has(path)) {
        rereadMarks.set(m.repo.id, "failed")
        log.warn("gitstation state re-read failed", { ...context, repositoryId: m.repo.id, consecutiveFailures: m.repo.stationRereadFailures + 1 })
      } else if (read.snapshots.has(path)) rereadMarks.set(m.repo.id, "clear")
      results.set(m.repo.id, { repositoryId: m.repo.id, ok: changes.failures.length === 0, links: 0 })
    } catch (err) {
      const f = failure(m.repo.id, source, err, now)
      results.set(m.repo.id, f.result)
      statuses.set(m.repo.id, f.status)
      held = true
    }
  }
  if (held) return hold("a repository could not be written")

  // Compare-and-set: only from the position this read started at, under this read's lease and generation.
  const feedStatus = read.failures.length > 0 ? { lastError: failureMessage(read.failures, bound[0]?.source ?? createGitStationSource(connection(group.members[0]), clients.gitstation)).slice(0, 500), lastErrorAt: now } : { readAt: now, lastError: null, lastErrorAt: null }
  const saved = await prisma.gitStationFeed.updateMany({
    where: { id: feed.id, generation: feed.generation, cursor: feed.cursor, leaseOwner: owner },
    data: { ...gitStationCursorCodec.toRow(read.cursor), ...feedStatus },
  })
  if (saved.count === 0) {
    log.info("gitstation feed cursor not saved: the feed was restarted meanwhile", context)
    await prisma.gitStationFeed.update({ where: { id: feed.id }, data: feedStatus })
    // The re-read marks stay: the restarted feed re-reads anyway.
    for (const [id, mark] of rereadMarks) if (mark === "clear") rereadMarks.delete(id)
  }
  await storeStatuses()
  for (const finish of finishes) await finish()
  return group.members.map((m) => results.get(m.repo.id)!)
}

/** Reads every feed that has a selected repository (all its repositories are written); returns the selected repositories' results. */
async function syncSelected(selected: (repo: SyncRepositoryRow) => boolean, clients: DevClients, now: Date): Promise<SyncResult[]> {
  const { groups, invalid } = groupByFeed(await loadRepositories())
  const results: SyncResult[] = []
  for (const i of invalid.filter((x) => selected(x.repo))) results.push(await fail(i.repo.id, i.kind, i.message, now))
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
