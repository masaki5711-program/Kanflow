import { prisma } from "@/lib/prisma"
import { open } from "@/lib/secret-box"
import { createGitLabClient, GitLabError, type GitLabClient, type GitLabCommit, type GitLabMergeRequest } from "@/lib/git/gitlab-client"
import { logger } from "@/lib/logger"
import { publishAfterCommit } from "@/lib/realtime/after-commit"
import { updateTask } from "@/services/sprint-backlog/sprint-backlog.service"
import { notify } from "@/services/_shared/notifications"
import type { Actor } from "@/services/_shared/actor"
import { syncReleases } from "./git-release-sync"
import { allMergeRequestsMerged, linksFromBranch, linksFromCommit, linksFromMergeRequest, type LinkDraft } from "./git-links"

/**
 * Polling sync of one repository (GitLab cannot reach the LAN, so no webhooks):
 * merge requests and commits changed since the last watermark, plus the
 * current PBI branches, become git_link rows of the PBIs they name.
 */
const log = logger.child({ module: "git-sync" })

/** First sync looks this far back. */
const FIRST_SYNC_DAYS = 30
/** Re-read a little before the watermark (clock skew, slow commits). */
const OVERLAP_MS = 5 * 60_000
/** Pipeline lookups per sync (one extra request per merge request). */
const MAX_PIPELINE_LOOKUPS = 25
/** Commit listings per sync (each up to 3 pages); a backlog beyond that resumes next sync. */
const MAX_COMMIT_REQUESTS = 4
/** A commit window this short is not split further even when cut off. */
const MIN_COMMIT_WINDOW_MS = 60_000

/** Who the activity log shows for automatic task completion. */
export const GIT_ACTOR: Actor = { userId: "", userName: "GitLab", systemRole: "member" }

export type ClientFactory = (apiBase: string, token: string) => GitLabClient
export const defaultClientFactory: ClientFactory = (apiBase, token) => createGitLabClient({ apiBase, token })
const defaultFactory = defaultClientFactory

export interface SyncResult {
  repositoryId: string
  ok: boolean
  links: number
  error?: string
  completedTasks?: number
}

export async function syncRepository(repositoryId: string, factory: ClientFactory = defaultFactory, now = new Date()): Promise<SyncResult> {
  const repo = await prisma.gitRepository.findUnique({
    where: { id: repositoryId },
    include: { project: { select: { deletedAt: true, gitIntegration: true } } },
  })
  const integration = repo?.project.gitIntegration
  if (!repo || repo.project.deletedAt || !integration?.enabled) return { repositoryId, ok: false, links: 0, error: "disabled" }
  const sealed = repo.tokenCipher ?? integration.tokenCipher
  const token = sealed ? open(sealed) : null
  if (!token) return fail(repositoryId, "token", "アクセストークンが未設定か、読み取れません。設定画面で入れ直してください。")

  try {
    const client = factory(repo.apiBase, token)
    const externalId = repo.externalId ?? (await client.getProject(repo.repoPath)).id
    // `base` is the last point up to which everything was read; re-read a little before it.
    const base = repo.syncCursor ?? new Date(now.getTime() - FIRST_SYNC_DAYS * 86_400_000)
    const since = new Date(base.getTime() - OVERLAP_MS)
    const [mrs, commits, branches] = await Promise.all([
      readMergeRequests(client, externalId, repositoryId, since, base, now),
      readCommits(client, externalId, repositoryId, since, base, now),
      client.listBranches(externalId, "pbi"),
    ])
    const mrDrafts = mrs.items.flatMap((mr) => linksFromMergeRequest(mr, now))
    const branchDrafts = branches.flatMap((b) => linksFromBranch(b, now))
    const drafts = [...mrDrafts, ...commits.items.flatMap((c) => linksFromCommit(c, now)), ...branchDrafts]
    const pbiIds = await resolvePbis(repo.projectId, drafts)
    await attachPipelines(client, externalId, repositoryId, mrDrafts.filter((d) => pbiIds.has(d.pbiNumber)))

    const { written, changed, newlyMerged, newlyFailed } = await writeLinks(repo.projectId, repo.id, drafts, pbiIds)
    const pruned = await pruneBranches(repo.id, branchDrafts, pbiIds)
    const releases = await syncReleasesSafely(client, repo, externalId, now)
    // Git panels / badges of the project refresh live, only when a link actually changed.
    if (changed + pruned + releases > 0) publishAfterCommit({ type: "git", projectId: repo.projectId, action: "sync" })
    // One watermark for both listings: the earlier of the two, so neither skips what it has not read.
    const syncCursor = new Date(Math.min(mrs.readUpTo.getTime(), commits.readUpTo.getTime()))
    await prisma.gitRepository.update({
      where: { id: repo.id },
      data: { externalId, syncedAt: now, syncCursor, lastError: null, lastErrorAt: null },
    })
    await notifyFailedPipelines(repo.projectId, newlyFailed)
    const completedTasks = integration.autoCompleteOnMerge ? await autoComplete(repo.projectId, newlyMerged) : 0
    return { repositoryId, ok: true, links: written, completedTasks }
  } catch (err) {
    const kind = err instanceof GitLabError ? err.kind : "http"
    if (!(err instanceof GitLabError)) log.error("git sync failed", { repositoryId, error: err instanceof Error ? err.message : String(err) })
    return fail(repositoryId, kind, syncErrorMessage(err))
  }
}

/** 403 on code / merge requests: the token is valid but its owner's role (e.g. Guest) cannot read them. */
export const FORBIDDEN_MESSAGE =
  "トークンの持ち主に、このリポジトリのコードやマージリクエストを読む権限がありません（GitLab のロールが「ゲスト」など）。" +
  "GitLab でレポーター以上のロールを付けてもらうか、レポーター以上の人のトークン（read_api）を設定してください。"

/** Japanese message stored on the repository (shown in settings and on the Git page). */
export function syncErrorMessage(err: unknown): string {
  if (!(err instanceof GitLabError)) return "同期中にエラーが発生しました"
  switch (err.kind) {
    case "auth":
      return "GitLab がトークンを拒否しました（無効または期限切れ）。read_api 権限の新しいトークンを設定してください。"
    case "forbidden":
      return FORBIDDEN_MESSAGE
    case "not_found":
      return "リポジトリが見つからないか、このトークンでは見えません。URL とトークンの権限を確認してください。"
    case "rate_limited":
      return "GitLab の利用制限に達しました。次回の同期で再試行します。"
    case "network":
      return "GitLab に接続できませんでした。次回の同期で再試行します。"
    default:
      return `GitLab がエラーを返しました（${err.status ?? "?"}）。次回の同期で再試行します。`
  }
}

async function fail(repositoryId: string, kind: string, message: string): Promise<SyncResult> {
  await prisma.gitRepository
    .update({ where: { id: repositoryId }, data: { lastError: message.slice(0, 500), lastErrorAt: new Date() } })
    .catch(() => undefined)
  return { repositoryId, ok: false, links: 0, error: kind }
}

/** PBI number → id of the project's live PBIs that are actually mentioned. */
async function resolvePbis(projectId: string, drafts: readonly LinkDraft[]): Promise<Map<number, string>> {
  const numbers = [...new Set(drafts.map((d) => d.pbiNumber))]
  if (numbers.length === 0) return new Map()
  const rows = await prisma.productBacklogItem.findMany({
    where: { projectId, deletedAt: null, displayId: { in: numbers } },
    select: { id: true, displayId: true },
  })
  return new Map(rows.map((r) => [r.displayId, r.id]))
}

/** What one listing of this sync read, and up to when it read everything. */
interface Listing<T> {
  items: T[]
  /** The watermark this listing allows: everything changed before it has been read. */
  readUpTo: Date
}

/**
 * Merge requests come oldest-change first. When the listing stops at its page
 * cap, everything up to the last fetched updated_at has been read, so the
 * watermark stops there and the next sync continues from it.
 */
async function readMergeRequests(
  client: GitLabClient,
  externalId: number,
  repositoryId: string,
  since: Date,
  base: Date,
  now: Date,
): Promise<Listing<GitLabMergeRequest>> {
  const r = await client.listMergeRequests(externalId, since)
  if (!r.truncated) return { items: r.items, readUpTo: now }
  log.warn("git sync truncated", { repositoryId, kind: "mr", pages: r.pages })
  const last = new Date(r.items.at(-1)?.updated_at ?? Number.NaN)
  return { items: r.items, readUpTo: Number.isNaN(last.getTime()) ? base : later(base, last) }
}

/**
 * Commits are read in time windows [start, end]. Only a window whose listing
 * was not cut off counts as read; a cut-off window is halved and retried, at
 * most MAX_COMMIT_REQUESTS times per sync. The watermark advances to the end of
 * the last fully read window, and the next sync resumes from there.
 */
async function readCommits(client: GitLabClient, externalId: number, repositoryId: string, since: Date, base: Date, now: Date): Promise<Listing<GitLabCommit>> {
  const byId = new Map<string, GitLabCommit>()
  let readUpTo = base
  let start = since
  let end = now
  let pages = 0
  for (let i = 0; i < MAX_COMMIT_REQUESTS; i++) {
    const r = await client.listCommits(externalId, start, end)
    pages += r.pages
    // Keep what a cut-off read returned too (writes are idempotent); only the watermark is held back.
    for (const c of r.items) byId.set(c.id, c)
    const span = end.getTime() - start.getTime()
    if (r.truncated && span > MIN_COMMIT_WINDOW_MS) {
      end = new Date(start.getTime() + Math.floor(span / 2))
      continue
    }
    if (r.truncated) {
      // More commits than one read can hold, committed within one minute (e.g. a large rebase):
      // move on rather than stall the repository forever, and say so.
      log.warn("git sync truncated", { repositoryId, kind: "commit", pages: r.pages, windowStart: start.toISOString(), windowEnd: end.toISOString(), skipped: true })
    }
    readUpTo = later(readUpTo, end)
    if (end.getTime() >= now.getTime()) return { items: [...byId.values()], readUpTo: now }
    start = end
    end = now
  }
  log.warn("git sync truncated", { repositoryId, kind: "commit", pages })
  return { items: [...byId.values()], readUpTo }
}

const later = (a: Date, b: Date) => (b.getTime() > a.getTime() ? b : a)

async function attachPipelines(client: GitLabClient, externalId: number, repositoryId: string, drafts: LinkDraft[]): Promise<void> {
  const byIid = new Map<string, LinkDraft[]>()
  for (const d of drafts) byIid.set(d.ref, [...(byIid.get(d.ref) ?? []), d])
  for (const [iid, group] of [...byIid].slice(-MAX_PIPELINE_LOOKUPS)) {
    try {
      const status = await client.getMergeRequestPipeline(externalId, Number(iid))
      for (const d of group) d.pipeline = status
    } catch (err) {
      // Pipeline status is decoration: keep the link (and its last known status) without it.
      log.warn("git pipeline lookup failed", { repositoryId, iid: Number(iid), error: err instanceof Error ? err.message : String(err) })
    }
  }
}

interface WriteResult {
  written: number
  /** Links created or changed by this sync (unchanged ones are not rewritten). */
  changed: number
  /** PBI ids with a merge request that turned merged in this sync. */
  newlyMerged: Set<string>
  /** Open merge requests whose pipeline turned "failed" in this sync. */
  newlyFailed: FailedPipeline[]
}

interface FailedPipeline {
  backlogItemId: string
  repositoryId: string
  ref: string
  occurredAt: Date
}

/** Stored columns a sync writes (compared to skip rewriting an unchanged link). */
const LINK_SELECT = { title: true, url: true, state: true, pipeline: true, author: true, sourceBranch: true, occurredAt: true, mergedAt: true } as const
type LinkData = Record<keyof typeof LINK_SELECT, unknown>

const comparable = (v: unknown) => (v instanceof Date ? v.getTime() : (v ?? null))

/** Pure: true when every written column equals the stored one. */
export function isSameLink(before: Partial<LinkData> | null, data: LinkData): boolean {
  if (!before) return false
  return (Object.keys(LINK_SELECT) as (keyof LinkData)[]).every((k) => comparable(before[k]) === comparable(data[k]))
}

async function writeLinks(projectId: string, repositoryId: string, drafts: readonly LinkDraft[], pbiIds: Map<number, string>): Promise<WriteResult> {
  const newlyMerged = new Set<string>()
  const newlyFailed: FailedPipeline[] = []
  let written = 0
  let changed = 0
  for (const d of drafts) {
    const backlogItemId = pbiIds.get(d.pbiNumber)
    if (!backlogItemId) continue
    const key = { repositoryId, kind: d.kind, ref: d.ref, backlogItemId }
    const where = { repositoryId_kind_ref_backlogItemId: key }
    const before = await prisma.gitLink.findUnique({ where, select: LINK_SELECT })
    const data = {
      title: d.title,
      url: d.url,
      state: d.state,
      // Keep the last known pipeline when this sync could not look it up.
      pipeline: d.pipeline ?? before?.pipeline ?? null,
      author: d.author,
      sourceBranch: d.sourceBranch,
      occurredAt: d.occurredAt,
      mergedAt: d.mergedAt,
    }
    written++
    if (isSameLink(before, data)) continue
    await prisma.gitLink.upsert({ where, create: { projectId, ...key, ...data }, update: data })
    changed++
    if (d.kind === "mr" && d.state === "merged" && before?.state !== "merged") newlyMerged.add(backlogItemId)
    if (d.kind === "mr" && data.pipeline === "failed" && before?.pipeline !== "failed" && (d.state === "opened" || d.state === "locked")) {
      newlyFailed.push({ backlogItemId, repositoryId, ref: d.ref, occurredAt: d.occurredAt })
    }
  }
  return { written, changed, newlyMerged, newlyFailed }
}

/**
 * A failed pipeline reaches the people working on the PBI (assignees of its
 * tasks in the active sprint). A new push that fails again notifies again.
 */
async function notifyFailedPipelines(projectId: string, failures: readonly FailedPipeline[]): Promise<void> {
  for (const f of failures) {
    try {
      const [pbi, assignees] = await Promise.all([
        prisma.productBacklogItem.findUnique({ where: { id: f.backlogItemId }, select: { displayId: true, initiative: true, userStory: true } }),
        prisma.taskAssignee.findMany({
          where: { task: { pbItemId: f.backlogItemId, status: { not: "done" }, sprint: { projectId, status: "active" } } },
          select: { userId: true },
        }),
      ])
      if (!pbi) continue
      await notify(prisma, {
        recipientIds: assignees.map((a) => a.userId),
        type: "git_pipeline_failed",
        projectId,
        entityType: "pbi",
        entityId: f.backlogItemId,
        payload: { entityLabel: pbi.initiative || pbi.userStory?.slice(0, 80) || `PBI-${pbi.displayId}`, displayId: pbi.displayId, mr: f.ref },
        dedupeKey: `git_pipeline_failed:${f.repositoryId}:${f.ref}:${f.occurredAt.getTime()}`,
      })
    } catch (err) {
      log.warn("pipeline-failure notification skipped", { ref: f.ref, error: err instanceof Error ? err.message : String(err) })
    }
  }
}

/** Tags are an add-on to the PBI links: a failure here must not fail the sync. */
async function syncReleasesSafely(client: GitLabClient, repo: { id: string; projectId: string; webUrl: string }, externalId: number, now: Date): Promise<number> {
  try {
    return await syncReleases(client, repo, externalId, now)
  } catch (err) {
    log.warn("tag sync skipped", { repositoryId: repo.id, error: err instanceof Error ? err.message : String(err) })
    return 0
  }
}

/** Branch links mirror the current branch list: deleted / merged-away branches disappear. */
async function pruneBranches(repositoryId: string, branchDrafts: readonly LinkDraft[], pbiIds: Map<number, string>): Promise<number> {
  const keep = new Set(branchDrafts.filter((d) => pbiIds.has(d.pbiNumber)).map((d) => `${d.ref}|${pbiIds.get(d.pbiNumber)}`))
  const existing = await prisma.gitLink.findMany({ where: { repositoryId, kind: "branch" }, select: { id: true, ref: true, backlogItemId: true } })
  const stale = existing.filter((l) => !keep.has(`${l.ref}|${l.backlogItemId}`)).map((l) => l.id)
  if (stale.length > 0) await prisma.gitLink.deleteMany({ where: { id: { in: stale } } })
  return stale.length
}

/**
 * Option "マージで自動完了": when every merge request of a PBI (all repositories)
 * is merged, its in-progress tasks in the active sprint become done.
 */
async function autoComplete(projectId: string, pbiIds: ReadonlySet<string>): Promise<number> {
  let done = 0
  for (const backlogItemId of pbiIds) {
    const mrs = await prisma.gitLink.findMany({ where: { backlogItemId, kind: "mr" }, select: { state: true } })
    if (!allMergeRequestsMerged(mrs.map((m) => m.state))) continue
    const tasks = await prisma.sprintBacklogItem.findMany({
      where: { pbItemId: backlogItemId, status: "in_progress", sprint: { projectId, status: "active" } },
      select: { id: true, sprintId: true },
    })
    for (const task of tasks) {
      try {
        await updateTask(projectId, task.sprintId, task.id, { status: "done" }, GIT_ACTOR)
        done++
      } catch (err) {
        log.warn("auto-complete skipped a task", { taskId: task.id, error: err instanceof Error ? err.message : String(err) })
      }
    }
  }
  return done
}

/** Sync every repository of a project (manual "今すぐ同期"), one after another. */
export async function syncProject(projectId: string, factory: ClientFactory = defaultFactory): Promise<SyncResult[]> {
  const repos = await prisma.gitRepository.findMany({ where: { projectId }, select: { id: true }, orderBy: { sortOrder: "asc" } })
  const results: SyncResult[] = []
  for (const r of repos) results.push(await syncRepository(r.id, factory))
  return results
}
