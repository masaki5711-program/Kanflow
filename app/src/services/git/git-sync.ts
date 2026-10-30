import { prisma } from "@/lib/prisma"
import { open } from "@/lib/secret-box"
import { logger } from "@/lib/logger"
import { publishAfterCommit } from "@/lib/realtime/after-commit"
import { updateTask } from "@/services/sprint-backlog/sprint-backlog.service"
import { notify } from "@/services/_shared/notifications"
import type { Actor } from "@/services/_shared/actor"
import { devSourceFor, type DevBranchListing, type DevChanges, type DevCursor, type DevListingFailure, type DevListingKind, type DevSource } from "./dev-source"
import { readableProvider, UnsupportedProviderError } from "./git-provider"
import { writeReleases } from "./git-release-sync"
import { allMergeRequestsMerged, linksFromBranch, linksFromCommit, linksFromMergeRequest, mergeRequestFields, type LinkDraft } from "./git-links"
import { defaultClientFactory, type ClientFactory } from "./gitlab-source"

/**
 * Polling sync of one repository: merge requests and commits changed since the
 * repository's cursor, plus the current PBI branches, become git_link rows of
 * the PBIs they name. What is read, and how, is the project's DevSource
 * (dev-source; GitLab today): the sync only stores the source's opaque cursor
 * and hands it back, never looking inside it.
 */
const log = logger.child({ module: "git-sync" })

/** Pipeline lookups per sync (one extra request per merge request). */
const MAX_PIPELINE_LOOKUPS = 25

export { LOOKBACK_DAYS, syncErrorMessage, type ClientFactory } from "./gitlab-source"

/** Who the activity log shows for automatic task completion. */
export const GIT_ACTOR: Actor = { userId: "", userName: "GitLab", systemRole: "member" }

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
  // A provider Kanflow cannot read is never sent to GitLab instead (logged once per repository).
  const provider = readableProvider(repositoryId, integration.provider, "sync")
  if (!provider) return fail(repositoryId, "provider", new UnsupportedProviderError(integration.provider).message)
  const kind = devSourceFor(provider)
  const sealed = repo.tokenCipher ?? integration.tokenCipher
  const token = sealed ? open(sealed) : null
  if (!token) return fail(repositoryId, "token", "アクセストークンが未設定か、読み取れません。設定画面で入れ直してください。")

  let source: DevSource | null = null
  try {
    source = kind.connect({ repositoryId, apiBase: repo.apiBase, repoPath: repo.repoPath, externalId: repo.externalId, token }, { gitlab: factory })
    const externalId = await source.locate()
    // 過去分を再同期 bumps the generation; cursors read under an older one are not written back.
    const generation = repo.syncGeneration ?? null
    const read = await readAll(source, kind.cursors.fromRow(repo, now), now)
    for (const f of read.failures) logFailure(source, repositoryId, f)

    const mrDrafts = read.mrs.flatMap((mr) => linksFromMergeRequest(mr, now))
    const branchDrafts = (read.branches?.items ?? []).flatMap((b) => linksFromBranch(b, now))
    const drafts = [...mrDrafts, ...read.commits.flatMap((c) => linksFromCommit(c, now)), ...branchDrafts]
    const pbiIds = await resolvePbis(repo.projectId, drafts)
    // Pipelines only for merge requests read for the first time (not the overlap re-read), and not
    // after the merge request listing failed (the lookups would most likely fail the same way).
    const lookups = mrDrafts.filter((d) => pbiIds.has(d.pbiNumber) && read.freshMrRefs.has(d.ref))
    if (!read.failures.some((f) => f.kind === "mr")) await attachPipelines(source, repositoryId, lookups)

    const { written, changed: linkChanges, newlyMerged, newlyFailed } = await writeLinks(repo.projectId, repo.id, drafts, pbiIds)
    // Links a developer declared (write:dev) whose MR does not name the PBI: kept current here.
    const declared = await refreshDeclaredLinks(repo.id, read.mrs, mrDrafts, pbiIds, now)
    for (const id of declared.newlyMerged) newlyMerged.add(id)
    const changed = linkChanges + declared.changed
    // `branches` is null when that listing failed: then nothing is marked gone.
    const gone = read.branches ? await markGoneBranches(repo.id, read.branches, branchDrafts, pbiIds, now) : 0
    const releases = await syncReleasesSafely(source, repo, now)
    // Git panels / badges of the project refresh live, only when a link actually changed.
    if (changed + gone + releases > 0) publishAfterCommit({ type: "git", projectId: repo.projectId, action: "sync" })
    // Links are written before the cursor moves: a cursor never passes anything unwritten.
    const status = read.failures.length > 0 ? { lastError: failureMessage(read.failures, source).slice(0, 500), lastErrorAt: now } : { syncedAt: now, lastError: null, lastErrorAt: null }
    const save = saveProgress(repositoryId, generation, { externalId, ...kind.cursors.toRow(read.cursor) }, status)
    if (read.failures.length > 0) await save.catch((err) => log.error("git sync progress not saved", { repositoryId, error: err instanceof Error ? err.message : String(err) }))
    else await save
    await notifyFailedPipelines(repo.projectId, newlyFailed)
    const completedTasks = integration.autoCompleteOnMerge ? await autoComplete(repo.projectId, newlyMerged) : 0
    const first = read.failures[0]
    if (first) return { repositoryId, ok: false, links: written, error: source.describeError(first.error).kind }
    return { repositoryId, ok: true, links: written, completedTasks }
  } catch (err) {
    const info = source ? source.describeError(err) : { kind: "http", expected: false, message: "同期中にエラーが発生しました" }
    if (!info.expected) log.error("git sync failed", { repositoryId, error: err instanceof Error ? err.message : String(err) })
    return fail(repositoryId, info.kind, info.message)
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

const LISTING_LABEL: Record<DevListingKind, string> = { mr: "マージリクエスト", commit: "コミット", "commit-lookback": "コミット（読み直し）", branch: "ブランチ" }

/** Stored on the repository: every failed listing, grouped by message ("マージリクエスト・コミット: …"). */
export function failureMessage(failures: readonly DevListingFailure[], source: Pick<DevSource, "describeError">): string {
  const byMessage = new Map<string, string[]>()
  for (const f of failures) {
    const message = source.describeError(f.error).message
    byMessage.set(message, [...(byMessage.get(message) ?? []), LISTING_LABEL[f.kind]])
  }
  return [...byMessage].map(([message, labels]) => `${labels.join("・")}: ${message}`).join(" / ")
}

/** Each failed listing is logged once, here (an answer of the source as a warning, anything else as an error). */
function logFailure(source: DevSource, repositoryId: string, failure: DevListingFailure): void {
  const info = source.describeError(failure.error)
  if (info.expected) log.warn("git sync listing failed", { repositoryId, kind: failure.kind, errorKind: info.kind, status: info.status })
  else log.error("git sync failed", { repositoryId, kind: failure.kind, error: failure.error instanceof Error ? failure.error.message : String(failure.error) })
}

interface ReadResult {
  mrs: DevChanges["mergeRequests"]
  /** Merge requests past the stored cursor (not only re-read by the overlap page). */
  freshMrRefs: ReadonlySet<string>
  commits: DevChanges["commits"]
  /** null when the branch listing failed. */
  branches: DevBranchListing | null
  cursor: DevCursor
  failures: readonly DevListingFailure[]
}

/** The cursor-driven listings, then the branches; a failing one does not stop the others. */
async function readAll(source: DevSource, cursor: DevCursor, now: Date): Promise<ReadResult> {
  const changes = await source.readChanges(cursor, now)
  const failures: DevListingFailure[] = [...changes.failures]
  let branches: DevBranchListing | null = null
  try {
    branches = await source.listBranches(now)
  } catch (error) {
    failures.push({ kind: "branch", error })
  }
  return { mrs: changes.mergeRequests, freshMrRefs: changes.freshMergeRequestRefs, commits: changes.commits, branches, cursor: changes.cursor, failures }
}

async function fail(repositoryId: string, kind: string, message: string): Promise<SyncResult> {
  // The failure itself is the result; a lost status write is logged, not rethrown.
  await prisma.gitRepository
    .update({ where: { id: repositoryId }, data: { lastError: message.slice(0, 500), lastErrorAt: new Date() } })
    .catch((err: unknown) => log.error("git sync status not saved", { repositoryId, error: err instanceof Error ? err.message : String(err) }))
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

async function attachPipelines(source: DevSource, repositoryId: string, drafts: LinkDraft[]): Promise<void> {
  const byRef = new Map<string, LinkDraft[]>()
  for (const d of drafts) byRef.set(d.ref, [...(byRef.get(d.ref) ?? []), d])
  for (const [ref, group] of [...byRef].slice(-MAX_PIPELINE_LOOKUPS)) {
    try {
      const status = await source.pipelineStatus(ref)
      for (const d of group) d.pipeline = status
    } catch (err) {
      // Pipeline status is decoration: keep the link (and its last known status) without it.
      log.warn("git pipeline lookup failed", { repositoryId, iid: Number(ref), error: err instanceof Error ? err.message : String(err) })
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
 * Merge request links declared by a developer (git_link.declaredAt, POST
 * /api/v1/.../dev/mr-links) get no draft when the MR's title / branch does not
 * name the PBI; their title / state / dates are refreshed from the MRs this sync
 * read (pipeline kept). Links that also have a draft were written by writeLinks.
 */
async function refreshDeclaredLinks(
  repositoryId: string,
  mrs: DevChanges["mergeRequests"],
  mrDrafts: readonly LinkDraft[],
  pbiIds: Map<number, string>,
  now: Date,
): Promise<{ changed: number; newlyMerged: Set<string> }> {
  const newlyMerged = new Set<string>()
  if (mrs.length === 0) return { changed: 0, newlyMerged }
  const byRef = new Map(mrs.map((mr) => [mr.ref, mr]))
  const drafted = new Set(mrDrafts.filter((d) => pbiIds.has(d.pbiNumber)).map((d) => `${d.ref}|${pbiIds.get(d.pbiNumber)}`))
  const rows = await prisma.gitLink.findMany({
    where: { repositoryId, kind: "mr", declaredAt: { not: null }, ref: { in: [...byRef.keys()] } },
    select: { id: true, ref: true, kind: true, backlogItemId: true, declaredAt: true, ...LINK_SELECT },
  })
  let changed = 0
  for (const row of rows) {
    const mr = byRef.get(row.ref)
    if (!mr || row.kind !== "mr" || !row.declaredAt || drafted.has(`${row.ref}|${row.backlogItemId}`)) continue
    const data = { ...mergeRequestFields(mr, now), pipeline: row.pipeline, goneAt: null }
    if (isSameLink(row, data)) continue
    await prisma.gitLink.updateMany({ where: { id: row.id }, data })
    changed++
    if (data.state === "merged" && row.state !== "merged") newlyMerged.add(row.backlogItemId)
  }
  return { changed, newlyMerged }
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
async function syncReleasesSafely(source: DevSource, repo: { id: string; projectId: string; webUrl: string }, now: Date): Promise<number> {
  try {
    return await writeReleases(repo, await source.listReleaseTags(repo.webUrl, now))
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
  listing: DevBranchListing,
  branchDrafts: readonly LinkDraft[],
  pbiIds: Map<number, string>,
  now: Date,
): Promise<number> {
  if (!listing.complete) return 0
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
