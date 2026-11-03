import { createHash } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { CURSOR_INVALID_MESSAGE } from "@/lib/git/sync-messages"
import type { DevClients, DevConnection } from "./dev-source"
import { applyRead, fail, failWith, failureMessage, MISSING_TOKEN_MESSAGE, repositoryToken, withBranches, type SyncIntegration, type SyncRepositoryRow, type SyncResult } from "./git-sync"
import { changesFor, createGitStationSource, gitStationCursorCodec, MISSING_INTEGRATION_MESSAGE, readFeed, stationClientFor } from "./gitstation-source"

/**
 * The GitStation feed sync (plan 11 K3, plan 12 §2.4): ONE cursor per GitStation integration as
 * one service-account token sees it (git_station_feed), not one per repository. Every poll reads
 * the feed once from that cursor, hands each Kanflow repository it covers its slice (by repository
 * path AND the repository's own Kanflow project in `work_items`), writes every repository through
 * the same code as the GitLab sync (git-sync applyRead), and only then saves the feed cursor —
 * a repository that could not be written keeps the cursor where it was (re-reading is idempotent).
 *
 * Why above the per-repository DevSource and not inside it: the feed spans up to 200 bound
 * repositories, so reading it once per repository would re-read the same events N times, and N
 * cursors over one feed could drift apart. The DevSource contract (codec, readChanges, branches,
 * tags, errors) is kept: gitstation-source implements it, and this module only decides who reads
 * the feed and when the shared cursor moves.
 */
const log = logger.child({ module: "git-sync" })

/** First 32 hex characters of SHA-256(token): tells tokens apart without storing them. */
export function tokenFingerprint(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex").slice(0, 32)
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

const keyString = (k: FeedKey) => `${k.apiBase}|${k.integrationId}|${k.tokenFingerprint}`

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
function loadRepositories(where: { id?: string } = {}) {
  return prisma.gitRepository.findMany({
    where: { ...where, project: { deletedAt: null, gitIntegration: { enabled: true, provider: "gitstation" } } },
    include: { project: { select: { deletedAt: true, gitIntegration: true } } },
    orderBy: [{ projectId: "asc" }, { sortOrder: "asc" }],
  })
}

/**
 * Groups repositories by feed. A repository without a token or integration id cannot join a feed:
 * its result is the failure (shown on the repository), and no feed is read for it.
 */
async function groupByFeed(repos: SyncRepositoryRow[]): Promise<{ groups: FeedGroup[]; failed: SyncResult[] }> {
  const groups = new Map<string, FeedGroup>()
  const failed: SyncResult[] = []
  for (const repo of repos) {
    const integration = repo.project.gitIntegration
    if (!integration) continue
    const integrationId = integration.stationIntegrationId?.trim()
    if (!integrationId) {
      failed.push(await fail(repo.id, "integration", MISSING_INTEGRATION_MESSAGE))
      continue
    }
    let token: string | null
    try {
      token = repositoryToken(repo, integration)
    } catch (err) {
      log.error("git token unreadable", { repositoryId: repo.id, error: err instanceof Error ? err.message : String(err) })
      token = null
    }
    if (!token) {
      failed.push(await fail(repo.id, "token", MISSING_TOKEN_MESSAGE))
      continue
    }
    const key = { apiBase: repo.apiBase, integrationId, tokenFingerprint: tokenFingerprint(token) }
    const group = groups.get(keyString(key)) ?? { key, token, members: [] }
    group.members.push({ repo, integration, token })
    groups.set(keyString(key), group)
  }
  return { groups: [...groups.values()], failed }
}

/** Reads one feed once and writes every repository it covers; the cursor moves only if all were written. */
async function syncFeed(group: FeedGroup, clients: DevClients, now: Date): Promise<SyncResult[]> {
  const feed = await prisma.gitStationFeed.upsert({
    where: { apiBase_integrationId_tokenFingerprint: group.key },
    create: group.key,
    update: {},
  })
  const context = { feedId: feed.id }
  let cursor
  try {
    cursor = gitStationCursorCodec.fromRow(feed, now)
  } catch (err) {
    log.error("git sync failed", { ...context, kind: "feed", error: err instanceof Error ? err.message : String(err) })
    await prisma.gitStationFeed.update({ where: { id: feed.id }, data: { lastError: CURSOR_INVALID_MESSAGE, lastErrorAt: now } })
    return Promise.all(group.members.map((m) => fail(m.repo.id, "cursor", CURSOR_INVALID_MESSAGE)))
  }

  const first = group.members[0]
  let read
  try {
    const client = stationClientFor({ apiBase: group.key.apiBase, token: group.token, stationIntegrationId: group.key.integrationId }, clients.gitstation)
    read = await readFeed(
      client,
      cursor,
      group.members.map((m) => m.repo.repoPath),
      context,
    )
  } catch (err) {
    // readFeed reports GitStation's answers as failures; a throw here is a defect.
    const results: SyncResult[] = []
    for (const m of group.members) results.push(await failWith(m.repo.id, createGitStationSource(connection(m), clients.gitstation), err))
    return results
  }
  if (read.restarted) log.info("gitstation state re-read", { ...context, reason: read.restarted, repositories: group.members.length })

  const results: SyncResult[] = []
  let allWritten = true
  for (const m of group.members) {
    const source = createGitStationSource(connection(m), clients.gitstation)
    try {
      // Still bound to this project (bindings change): otherwise nothing is read or written for it,
      // and its events never reach it anyway (work_items) — the shared cursor may move on.
      await source.locate()
    } catch (err) {
      results.push(await failWith(m.repo.id, source, err))
      continue
    }
    try {
      const changes = changesFor(read, { repoPath: m.repo.repoPath, projectId: m.repo.projectId }, now)
      results.push(await applyRead(m.repo, m.integration, "gitstation", source, await withBranches(source, changes, now), now, null))
    } catch (err) {
      allWritten = false
      results.push(await failWith(m.repo.id, source, err))
    }
  }
  if (!allWritten) {
    log.warn("gitstation feed cursor kept: a repository was not written", context)
    return results
  }

  const status = read.failures.length > 0 ? { lastError: failureMessage(read.failures, createGitStationSource(connection(first), clients.gitstation)).slice(0, 500), lastErrorAt: now } : { readAt: now, lastError: null, lastErrorAt: null }
  const saved = await prisma.gitStationFeed.updateMany({ where: { id: feed.id, generation: feed.generation }, data: { ...gitStationCursorCodec.toRow(read.cursor), ...status } })
  if (saved.count === 0) {
    log.info("git sync cursors not saved: a resync started meanwhile", context)
    await prisma.gitStationFeed.update({ where: { id: feed.id }, data: status })
  }
  return results
}

/** The poller's GitStation pass: every feed once. A failing feed does not stop the others. */
export async function syncGitStationFeeds(clients: DevClients = {}, now = new Date()): Promise<SyncResult[]> {
  const { groups, failed } = await groupByFeed(await loadRepositories())
  const results = [...failed]
  for (const group of groups) {
    try {
      results.push(...(await syncFeed(group, clients, now)))
    } catch (err) {
      log.error("gitstation feed sync failed", { apiBase: group.key.apiBase, error: err instanceof Error ? err.message : String(err) })
    }
  }
  return results
}

/** 今すぐ同期 of one GitStation repository: its whole feed is read (shared cursor); its own result is returned. */
export async function syncFeedOfRepository(repositoryId: string, clients: DevClients = {}, now = new Date()): Promise<SyncResult> {
  try {
    return await syncFeedOfRepositoryUnsafe(repositoryId, clients, now)
  } catch (err) {
    // e.g. the feed row could not be read or written: the repository shows it, the route does not fail.
    return failWith(repositoryId, null, err)
  }
}

async function syncFeedOfRepositoryUnsafe(repositoryId: string, clients: DevClients, now: Date): Promise<SyncResult> {
  const own = await loadRepositories({ id: repositoryId })
  const { groups, failed } = await groupByFeed(own)
  if (failed[0]) return failed[0]
  const group = groups[0]
  if (!group) return { repositoryId, ok: false, links: 0, error: "disabled" }
  // Every repository of the same feed is written with it: the shared cursor must not pass their events.
  const all = await groupByFeed(await loadRepositories())
  const full = all.groups.find((g) => keyString(g.key) === keyString(group.key)) ?? group
  const results = await syncFeed(full, clients, now)
  return results.find((r) => r.repositoryId === repositoryId) ?? { repositoryId, ok: false, links: 0, error: "disabled" }
}

/**
 * 過去分を再同期 of a GitStation repository: its feed restarts (state re-read through the
 * dev-status listing, then the feed from the position taken first). Bumps the generation so a read
 * already running does not write its cursor back. Returns false when the repository cannot name a
 * feed yet (no token / integration id): its next sync shows why.
 */
export async function restartFeedOfRepository(repositoryId: string): Promise<boolean> {
  const repo = await prisma.gitRepository.findUnique({ where: { id: repositoryId }, include: { project: { select: { deletedAt: true, gitIntegration: true } } } })
  if (!repo) return false
  const integration = repo.project.gitIntegration
  const integrationId = integration?.stationIntegrationId?.trim()
  const token = integration ? repositoryToken(repo, integration) : null
  if (!integrationId || !token) return false
  const key = { apiBase: repo.apiBase, integrationId, tokenFingerprint: tokenFingerprint(token) }
  await prisma.gitStationFeed.upsert({
    where: { apiBase_integrationId_tokenFingerprint: key },
    create: { ...key, ...gitStationCursorCodec.restart({}, new Date()) },
    update: { ...gitStationCursorCodec.restart({}, new Date()), generation: { increment: 1 } },
  })
  return true
}
