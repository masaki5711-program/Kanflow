import { prisma } from "@/lib/prisma"
import { open } from "@/lib/secret-box"
import { createGitLabClient, GitLabError, type GitLabClient } from "@/lib/git/gitlab-client"
import { logger } from "@/lib/logger"
import { updateTask } from "@/services/sprint-backlog/sprint-backlog.service"
import type { Actor } from "@/services/_shared/actor"
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

/** Who the activity log shows for automatic task completion. */
export const GIT_ACTOR: Actor = { userId: "", userName: "GitLab", systemRole: "member" }

export type ClientFactory = (apiBase: string, token: string) => GitLabClient
const defaultFactory: ClientFactory = (apiBase, token) => createGitLabClient({ apiBase, token })

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
    const since = new Date((repo.syncCursor ?? new Date(now.getTime() - FIRST_SYNC_DAYS * 86_400_000)).getTime() - OVERLAP_MS)
    const [mrs, commits, branches] = await Promise.all([
      client.listMergeRequests(externalId, since),
      client.listCommits(externalId, since),
      client.listBranches(externalId, "pbi"),
    ])
    const mrDrafts = mrs.flatMap((mr) => linksFromMergeRequest(mr, now))
    const branchDrafts = branches.flatMap((b) => linksFromBranch(b, now))
    const drafts = [...mrDrafts, ...commits.flatMap((c) => linksFromCommit(c, now)), ...branchDrafts]
    const pbiIds = await resolvePbis(repo.projectId, drafts)
    await attachPipelines(client, externalId, mrDrafts.filter((d) => pbiIds.has(d.pbiNumber)))

    const { written, newlyMerged } = await writeLinks(repo.projectId, repo.id, drafts, pbiIds)
    await pruneBranches(repo.id, branchDrafts, pbiIds)
    await prisma.gitRepository.update({
      where: { id: repo.id },
      data: { externalId, syncedAt: now, syncCursor: now, lastError: null, lastErrorAt: null },
    })
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

async function attachPipelines(client: GitLabClient, externalId: number, drafts: LinkDraft[]): Promise<void> {
  const byIid = new Map<string, LinkDraft[]>()
  for (const d of drafts) byIid.set(d.ref, [...(byIid.get(d.ref) ?? []), d])
  for (const [iid, group] of [...byIid].slice(-MAX_PIPELINE_LOOKUPS)) {
    try {
      const status = await client.getMergeRequestPipeline(externalId, Number(iid))
      for (const d of group) d.pipeline = status
    } catch {
      // Pipeline status is decoration: keep the link without it.
    }
  }
}

interface WriteResult {
  written: number
  /** PBI ids with a merge request that turned merged in this sync. */
  newlyMerged: Set<string>
}

async function writeLinks(projectId: string, repositoryId: string, drafts: readonly LinkDraft[], pbiIds: Map<number, string>): Promise<WriteResult> {
  const newlyMerged = new Set<string>()
  let written = 0
  for (const d of drafts) {
    const backlogItemId = pbiIds.get(d.pbiNumber)
    if (!backlogItemId) continue
    const key = { repositoryId, kind: d.kind, ref: d.ref, backlogItemId }
    const where = { repositoryId_kind_ref_backlogItemId: key }
    const before = d.kind === "mr" ? await prisma.gitLink.findUnique({ where, select: { state: true, pipeline: true } }) : null
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
    await prisma.gitLink.upsert({ where, create: { projectId, ...key, ...data }, update: data })
    written++
    if (d.kind === "mr" && d.state === "merged" && before?.state !== "merged") newlyMerged.add(backlogItemId)
  }
  return { written, newlyMerged }
}

/** Branch links mirror the current branch list: deleted / merged-away branches disappear. */
async function pruneBranches(repositoryId: string, branchDrafts: readonly LinkDraft[], pbiIds: Map<number, string>): Promise<void> {
  const keep = new Set(branchDrafts.filter((d) => pbiIds.has(d.pbiNumber)).map((d) => `${d.ref}|${pbiIds.get(d.pbiNumber)}`))
  const existing = await prisma.gitLink.findMany({ where: { repositoryId, kind: "branch" }, select: { id: true, ref: true, backlogItemId: true } })
  const stale = existing.filter((l) => !keep.has(`${l.ref}|${l.backlogItemId}`)).map((l) => l.id)
  if (stale.length > 0) await prisma.gitLink.deleteMany({ where: { id: { in: stale } } })
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
