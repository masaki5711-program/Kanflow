import { prisma } from "@/lib/prisma"
import { open } from "@/lib/secret-box"
import { createGitLabClient, GitLabError, type GitLabBranch, type GitLabClient, type GitLabCommit, type GitLabMergeRequest, type Paged } from "@/lib/git/gitlab-client"
import { logger } from "@/lib/logger"
import { publishAfterCommit } from "@/lib/realtime/after-commit"
import { updateTask } from "@/services/sprint-backlog/sprint-backlog.service"
import { notify } from "@/services/_shared/notifications"
import type { Actor } from "@/services/_shared/actor"
import { syncReleases } from "./git-release-sync"
import { allMergeRequestsMerged, linksFromBranch, linksFromCommit, linksFromMergeRequest, type LinkDraft } from "./git-links"
import { cursorsFromRow, cursorsToRow, DAY_MS, INITIAL_WINDOW_SEC, type SyncCursors } from "./git-sync-cursors"
import { COMMIT_LAG_MS, MAX_COMMIT_LISTINGS, MAX_LOOKBACK_LISTINGS, readMergeRequests, scanCommits } from "./git-sync-listings"

/**
 * Polling sync of one repository (GitLab cannot reach the LAN, so no webhooks):
 * merge requests and commits changed since their cursors, plus the current PBI
 * branches, become git_link rows of the PBIs they name. One cursor per listing
 * (git-sync-cursors): merge requests by GitLab's updated_at + tie-breaker,
 * commits by resumable time windows, plus a daily look-back for late pushes.
 */
const log = logger.child({ module: "git-sync" })

/** Pipeline lookups per sync (one extra request per merge request). */
const MAX_PIPELINE_LOOKUPS = 25
/** Daily look-back: re-read this many days of commits (late-pushed commits; docs/operations/git-integration.md). */
export const LOOKBACK_DAYS = 14
const LOOKBACK_EVERY_MS = DAY_MS

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
    // 過去分を再同期 bumps the generation; cursors read under an older one are not written back.
    const generation = repo.syncGeneration ?? null
    const read = await readAll(client, externalId, repositoryId, cursorsFromRow(repo, now), now)

    const mrDrafts = read.mrs.flatMap((mr) => linksFromMergeRequest(mr, now))
    const branchDrafts = (read.branches?.items ?? []).flatMap((b) => linksFromBranch(b, now))
    const drafts = [...mrDrafts, ...read.commits.flatMap((c) => linksFromCommit(c, now)), ...branchDrafts]
    const pbiIds = await resolvePbis(repo.projectId, drafts)
    // Pipelines only for merge requests read for the first time (not the overlap re-read), and not
    // after the merge request listing failed (the lookups would most likely fail the same way).
    const lookups = mrDrafts.filter((d) => pbiIds.has(d.pbiNumber) && read.freshMrIids.has(Number(d.ref)))
    if (!read.failures.some((f) => f.kind === "mr")) await attachPipelines(client, externalId, repositoryId, lookups)

    const { written, changed, newlyMerged, newlyFailed } = await writeLinks(repo.projectId, repo.id, drafts, pbiIds)
    // `branches` is null when that listing failed: then nothing is marked gone.
    const gone = read.branches ? await markGoneBranches(repo.id, read.branches, branchDrafts, pbiIds, now) : 0
    const releases = await syncReleasesSafely(client, repo, externalId, now)
    // Git panels / badges of the project refresh live, only when a link actually changed.
    if (changed + gone + releases > 0) publishAfterCommit({ type: "git", projectId: repo.projectId, action: "sync" })
    // Links are written before the cursors move: a cursor never passes anything unwritten.
    const status = read.failures.length > 0 ? { lastError: failureMessage(read.failures).slice(0, 500), lastErrorAt: now } : { syncedAt: now, lastError: null, lastErrorAt: null }
    const save = saveProgress(repositoryId, generation, { externalId, ...cursorsToRow(read.cursors) }, status)
    if (read.failures.length > 0) await save.catch((err) => log.error("git sync progress not saved", { repositoryId, error: err instanceof Error ? err.message : String(err) }))
    else await save
    await notifyFailedPipelines(repo.projectId, newlyFailed)
    const completedTasks = integration.autoCompleteOnMerge ? await autoComplete(repo.projectId, newlyMerged) : 0
    const first = read.failures[0]
    if (first) return { repositoryId, ok: false, links: written, error: first.error instanceof GitLabError ? first.error.kind : "http" }
    return { repositoryId, ok: true, links: written, completedTasks }
  } catch (err) {
    const kind = err instanceof GitLabError ? err.kind : "http"
    if (!(err instanceof GitLabError)) log.error("git sync failed", { repositoryId, error: err instanceof Error ? err.message : String(err) })
    return fail(repositoryId, kind, syncErrorMessage(err))
  }
}

/**
 * Cursors are written only if no 過去分を再同期 started since this sync read
 * them (same generation); otherwise only the status is written, so the
 * resync's reset is not undone by a sync that was already running.
 */
async function saveProgress(repositoryId: string, generation: number | null, cursors: Record<string, unknown>, status: Record<string, unknown>): Promise<void> {
  const r = await prisma.gitRepository.updateMany({ where: { id: repositoryId, syncGeneration: generation }, data: { ...cursors, ...status } })
  if (r.count > 0) return
  log.info("git sync cursors not saved: a resync started meanwhile", { repositoryId })
  await prisma.gitRepository.update({ where: { id: repositoryId }, data: status })
}

type ListingKind = "mr" | "commit" | "commit-lookback" | "branch"

interface ListingFailure {
  kind: ListingKind
  error: unknown
}

const LISTING_LABEL: Record<ListingKind, string> = { mr: "マージリクエスト", commit: "コミット", "commit-lookback": "コミット（読み直し）", branch: "ブランチ" }

/** Stored on the repository: every failed listing, grouped by message ("マージリクエスト・コミット: …"). */
export function failureMessage(failures: readonly ListingFailure[]): string {
  const byMessage = new Map<string, string[]>()
  for (const f of failures) {
    const message = syncErrorMessage(f.error)
    byMessage.set(message, [...(byMessage.get(message) ?? []), LISTING_LABEL[f.kind]])
  }
  return [...byMessage].map(([message, labels]) => `${labels.join("・")}: ${message}`).join(" / ")
}

/** Each failed listing is logged once, here (GitLab answers as a warning, anything else as an error). */
function logFailure(repositoryId: string, kind: ListingKind, error: unknown): void {
  if (error instanceof GitLabError) log.warn("git sync listing failed", { repositoryId, kind, errorKind: error.kind, status: error.status })
  else log.error("git sync failed", { repositoryId, kind, error: error instanceof Error ? error.message : String(error) })
}

interface ReadResult {
  mrs: GitLabMergeRequest[]
  /** Merge requests past the stored cursor (not only re-read by the overlap page). */
  freshMrIids: Set<number>
  commits: GitLabCommit[]
  /** null when the branch listing failed. */
  branches: Paged<GitLabBranch> | null
  cursors: SyncCursors
  failures: ListingFailure[]
}

/** When the branch-list-truncated warning was last logged per repository (once a day). */
const branchTruncationWarned = new Map<string, number>()

/**
 * The listings of one sync, one after another but independent of each other:
 * a failing one (e.g. merge requests disabled in the project → 403) keeps its
 * cursor at its last completed page / window and the others still run.
 */
async function readAll(client: GitLabClient, externalId: number, repositoryId: string, start: SyncCursors, now: Date): Promise<ReadResult> {
  const failures: ListingFailure[] = []
  const failed = (kind: ListingKind, error: unknown) => {
    failures.push({ kind, error })
    logFailure(repositoryId, kind, error)
  }

  const mr = await readMergeRequests(client, externalId, repositoryId, start.mr)
  if (mr.error !== undefined) failed("mr", mr.error)

  // GitLab's clock bounds the commit windows (Kanflow's may be off); Kanflow's only when GitLab sent none.
  if (!mr.serverTime) log.warn("git sync uses Kanflow's clock", { repositoryId, reason: "no usable Date header from GitLab" })
  const gitlabNow = mr.serverTime ?? now
  const forward = await scanCommits(client, externalId, {
    repositoryId,
    pass: "commit",
    scan: start.commit,
    skips: start.commit.skips,
    until: new Date(gitlabNow.getTime() - COMMIT_LAG_MS),
    readTo: gitlabNow,
    budget: MAX_COMMIT_LISTINGS,
  })
  if (forward.error !== undefined) failed("commit", forward.error)
  else if (!forward.done) log.info("git sync backlog", { repositoryId, kind: "commit", cursorAt: forward.scan.at.toISOString(), windowSec: forward.scan.widthSec })
  const commit = { ...forward.scan, skips: forward.skips }

  const lookback = await readLookback(client, externalId, repositoryId, start.lookback, commit.at, gitlabNow)
  if (lookback.error !== undefined) failed("commit-lookback", lookback.error)

  let branches: Paged<GitLabBranch> | null = null
  try {
    branches = await client.listBranches(externalId, "pbi")
    if (branches.truncated && now.getTime() - (branchTruncationWarned.get(repositoryId) ?? Number.NEGATIVE_INFINITY) >= DAY_MS) {
      branchTruncationWarned.set(repositoryId, now.getTime())
      log.warn("git sync truncated", { repositoryId, kind: "branch", pages: branches.pages, markedGone: false })
    }
  } catch (error) {
    failed("branch", error)
  }

  const startMs = start.mr.at.getTime()
  const fresh = mr.items.filter((m) => {
    const t = new Date(m.updated_at).getTime()
    return Number.isNaN(t) || t > startMs || (t === startMs && start.mr.seen === 0)
  })
  return {
    mrs: mr.items,
    freshMrIids: new Set(fresh.map((m) => m.iid)),
    commits: [...forward.items, ...lookback.items],
    branches,
    cursors: { mr: mr.cursor, commit, lookback: lookback.state },
    failures,
  }
}

/**
 * Look-back pass: once a day the last LOOKBACK_DAYS of commits are read again,
 * up to the forward cursor (a commit pushed days after it was made carries its
 * old date, so its window had already been read without it). 過去分を再同期
 * starts the same pass 90 days back. Bounded per sync; resumes where it stopped.
 */
async function readLookback(
  client: GitLabClient,
  externalId: number,
  repositoryId: string,
  start: SyncCursors["lookback"],
  forwardAt: Date,
  gitlabNow: Date,
): Promise<{ items: GitLabCommit[]; state: SyncCursors["lookback"]; error?: unknown }> {
  let state = start
  const due = !state.startedAt || gitlabNow.getTime() - state.startedAt.getTime() >= LOOKBACK_EVERY_MS
  if (!state.scan && due) state = { scan: { at: new Date(gitlabNow.getTime() - LOOKBACK_DAYS * DAY_MS), widthSec: INITIAL_WINDOW_SEC }, startedAt: gitlabNow }
  if (!state.scan) return { items: [], state }
  const r = await scanCommits(client, externalId, {
    repositoryId,
    pass: "commit-lookback",
    scan: state.scan,
    skips: 0,
    until: forwardAt,
    readTo: forwardAt,
    budget: MAX_LOOKBACK_LISTINGS,
  })
  if (r.done) log.info("git sync look-back done", { repositoryId, listings: r.listings, skipped: r.skipped })
  const next = { scan: r.done ? null : r.scan, startedAt: state.startedAt }
  return r.error !== undefined ? { items: r.items, state: next, error: r.error } : { items: r.items, state: next }
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
const LINK_SELECT = { title: true, url: true, state: true, pipeline: true, author: true, sourceBranch: true, occurredAt: true, mergedAt: true, goneAt: true } as const
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
      // Seen in this sync: a branch marked gone that came back is live again.
      goneAt: null,
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

/**
 * Branch links follow the branch list: a branch that is no longer listed keeps
 * its link, marked gone (the PBI panel shows it as 削除済み, badges ignore it).
 * Only a complete listing proves a branch is gone: a truncated one marks nothing.
 */
async function markGoneBranches(
  repositoryId: string,
  listing: Paged<GitLabBranch>,
  branchDrafts: readonly LinkDraft[],
  pbiIds: Map<number, string>,
  now: Date,
): Promise<number> {
  if (listing.truncated) return 0
  const keep = new Set(branchDrafts.filter((d) => pbiIds.has(d.pbiNumber)).map((d) => `${d.ref}|${pbiIds.get(d.pbiNumber)}`))
  const live = await prisma.gitLink.findMany({ where: { repositoryId, kind: "branch", goneAt: null }, select: { id: true, ref: true, backlogItemId: true } })
  const gone = live.filter((l) => !keep.has(`${l.ref}|${l.backlogItemId}`)).map((l) => l.id)
  if (gone.length > 0) await prisma.gitLink.updateMany({ where: { id: { in: gone }, goneAt: null }, data: { goneAt: now } })
  return gone.length
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
