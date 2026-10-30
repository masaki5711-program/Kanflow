import { prisma } from "@/lib/prisma"
import { open } from "@/lib/secret-box"
import { GitLabError, type GitLabClient } from "@/lib/git/gitlab-client"
import { logger } from "@/lib/logger"
import { publishAfterCommit } from "@/lib/realtime/after-commit"
import { defaultClientFactory, syncErrorMessage, type ClientFactory } from "./gitlab-source"
import { chunkFile } from "./repo-chunker"
import { fileText } from "./repo-index-content"
import { gitBlobSha, planFromCompare, planFromTree, remainingAfter, MAX_INDEX_FILES, type FileChange } from "./repo-index-plan"
import { decideFile, parsePathFilter } from "./repo-index-rules"

/**
 * Knowledge index of one repository ("AI の参照資料として使う"), GitLab API only.
 *
 * Each call costs one request when nothing changed (newest commit = indexed
 * commit). Otherwise the files changed since the indexed commit (compare) —
 * or, on the first pass / after a filter change / when the compare fails,
 * every file of the tree whose blob id differs — are downloaded one by one,
 * turned into chunks and stored. A pass stops at its deadline / download
 * budget and resumes after the last finished path on the next call. File
 * contents and the token are never logged.
 */
const log = logger.child({ module: "repo-index" })

/** Recursive tree pages (100 entries each; directories count too). */
const TREE_MAX_PAGES = 40
/** Download budget of one call; the rest of the pass continues next time. */
const MAX_PASS_BYTES = 150 * 1024 * 1024
/** Stored passages per repository. */
export const MAX_CHUNKS_PER_REPO = 30_000
/** Gap between file downloads (keeps the GitLab request rate modest, yields the event loop). */
const DEFAULT_PAUSE_MS = 100

export type IndexStatus = "disabled" | "up_to_date" | "done" | "partial" | "failed"

export interface IndexResult {
  repositoryId: string
  status: IndexStatus
  /** Files written or removed by this call. */
  processed: number
  skipped: number
  error?: string
}

export interface IndexOptions {
  factory?: ClientFactory
  /** Epoch ms after which the pass pauses (resumed on the next call). */
  deadline?: number
  pauseMs?: number
}

type RepoRow = NonNullable<Awaited<ReturnType<typeof loadRepo>>>

function loadRepo(repositoryId: string) {
  return prisma.gitRepository.findUnique({
    where: { id: repositoryId },
    include: { project: { select: { deletedAt: true, gitIntegration: true } } },
  })
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function indexRepository(repositoryId: string, opts: IndexOptions = {}): Promise<IndexResult> {
  const repo = await loadRepo(repositoryId)
  const integration = repo?.project.gitIntegration
  const base = { repositoryId, processed: 0, skipped: 0 }
  if (!repo || repo.project.deletedAt || !integration?.enabled || !repo.aiKnowledge) return { ...base, status: "disabled" }
  const sealed = repo.tokenCipher ?? integration.tokenCipher
  const token = sealed ? open(sealed) : null
  if (!token) return fail(repo, "アクセストークンが未設定か、読み取れません。設定画面で入れ直してください。")
  try {
    const client = (opts.factory ?? defaultClientFactory)(repo.apiBase, token)
    const externalId = repo.externalId ?? (await client.getProject(repo.repoPath)).id
    const head = await client.latestCommitSha(externalId)
    const unchanged = head ? head === repo.indexedSha : repo.indexedAt !== null && repo.indexedSha === null
    if (unchanged && !repo.indexTargetSha) {
      // GitLab answered and the index is current: an old error (e.g. a network blip) is over, so stop showing it.
      if (repo.indexError) await clearIndexError(repo)
      return { ...base, status: "up_to_date" }
    }
    return await runPass(repo, client, externalId, head, opts)
  } catch (err) {
    if (!(err instanceof GitLabError)) log.error("repository index failed", { repositoryId, error: err instanceof Error ? err.message : String(err) })
    return fail(repo, err instanceof GitLabError ? syncErrorMessage(err) : "取り込み中にエラーが発生しました。次回の同期で再試行します。")
  }
}

async function clearIndexError(repo: RepoRow): Promise<void> {
  await prisma.gitRepository.update({ where: { id: repo.id }, data: { indexError: null, indexErrorAt: null } }).catch(() => undefined)
  publishAfterCommit({ type: "git", projectId: repo.projectId, action: "index" })
}

async function fail(repo: RepoRow, message: string): Promise<IndexResult> {
  await prisma.gitRepository
    .update({ where: { id: repo.id }, data: { indexError: message.slice(0, 500), indexErrorAt: new Date() } })
    .catch(() => undefined)
  publishAfterCommit({ type: "git", projectId: repo.projectId, action: "index" })
  return { repositoryId: repo.id, status: "failed", processed: 0, skipped: 0, error: message }
}

/** path → blob id of the files stored now (first chunk of each). */
async function storedBlobs(repositoryId: string): Promise<Map<string, string>> {
  const rows = await prisma.repoChunk.findMany({ where: { repositoryId, chunkNo: 0 }, select: { path: true, blobSha: true } })
  return new Map(rows.map((r) => [r.path, r.blobSha]))
}

/** Incremental plan when the compare works, else the full plan from the tree. */
async function buildPlan(repo: RepoRow, client: GitLabClient, externalId: number, head: string, include: (p: string) => boolean): Promise<FileChange[]> {
  if (repo.indexedSha) {
    try {
      const cmp = await client.compare(externalId, repo.indexedSha, head)
      const plan = cmp.compare_timeout ? null : planFromCompare(cmp.diffs, include)
      if (plan) return plan
    } catch (err) {
      // Only a vanished / unusable base commit (404, other HTTP errors) means "start over". Token problems,
      // rate limits and network trouble fail the pass instead: a full tree scan would only add load.
      if (!(err instanceof GitLabError) || ["auth", "forbidden", "rate_limited", "network"].includes(err.kind)) throw err
    }
  }
  const tree = await client.listTree(externalId, head, TREE_MAX_PAGES)
  const { changes, truncated } = planFromTree(tree, await storedBlobs(repo.id), include)
  if (truncated) log.warn("repository has more files than the index keeps", { repositoryId: repo.id, max: MAX_INDEX_FILES })
  return changes
}

interface PassState {
  processed: number
  skipped: number
  bytes: number
  chunks: number
}

async function runPass(repo: RepoRow, client: GitLabClient, externalId: number, head: string | null, opts: IndexOptions): Promise<IndexResult> {
  if (!head) return finish(repo, null, { processed: 0, skipped: 0, bytes: 0, chunks: 0 }, true)
  const prefixes = parsePathFilter(repo.aiPathFilter) ?? []
  const include = (p: string) => decideFile(p, prefixes).index
  const resumeCursor = repo.indexTargetSha === head ? repo.indexCursor : null
  if (repo.indexTargetSha !== head) {
    await prisma.gitRepository.update({ where: { id: repo.id }, data: { indexTargetSha: head, indexCursor: null } })
  }
  const todo = remainingAfter(await buildPlan(repo, client, externalId, head, include), resumeCursor)
  const state: PassState = { processed: 0, skipped: 0, bytes: 0, chunks: await prisma.repoChunk.count({ where: { repositoryId: repo.id } }) }
  for (const change of todo) {
    if ((opts.deadline !== undefined && Date.now() > opts.deadline) || state.bytes > MAX_PASS_BYTES) {
      return { repositoryId: repo.id, status: "partial", processed: state.processed, skipped: state.skipped }
    }
    await applyChange(repo, client, externalId, head, prefixes, change, state)
    await prisma.gitRepository.update({ where: { id: repo.id }, data: { indexCursor: change.path } })
    if (change.op === "upsert") await sleep(opts.pauseMs ?? DEFAULT_PAUSE_MS)
  }
  return finish(repo, head, state, false)
}

async function removeFile(repositoryId: string, path: string): Promise<number> {
  return (await prisma.repoChunk.deleteMany({ where: { repositoryId, path } })).count
}

async function applyChange(repo: RepoRow, client: GitLabClient, externalId: number, head: string, prefixes: string[], change: FileChange, state: PassState): Promise<void> {
  const decision = decideFile(change.path, prefixes)
  if (change.op === "delete" || !decision.index) {
    state.chunks -= await removeFile(repo.id, change.path)
    state.processed++
    return
  }
  let raw
  try {
    raw = await client.rawFile(externalId, change.path, head, decision.maxBytes)
  } catch (err) {
    if (!(err instanceof GitLabError && err.kind === "not_found")) throw err
    raw = null
  }
  const content = raw?.kind === "ok" ? await fileText(change.path, decision.kind, raw.data) : null
  const chunks = raw?.kind === "ok" && content?.ok ? chunkFile(change.path, content.text, decision.kind === "text") : []
  if (raw?.kind === "ok") state.bytes += raw.data.byteLength
  const before = await prisma.repoChunk.count({ where: { repositoryId: repo.id, path: change.path } })
  // Too large / binary / unreadable / over the repository cap: the file's old passages go, nothing new is stored.
  const store = raw?.kind === "ok" && chunks.length > 0 && state.chunks - before + chunks.length <= MAX_CHUNKS_PER_REPO
  const blobSha = raw?.kind === "ok" ? gitBlobSha(raw.data) : ""
  const rows = store
    ? chunks.map((c, chunkNo) => ({ repositoryId: repo.id, projectId: repo.projectId, path: change.path, heading: c.heading, anchor: c.anchor, chunkNo, content: c.content, blobSha }))
    : []
  // Old passages are replaced atomically: a search never sees a half-written file.
  await prisma.$transaction([prisma.repoChunk.deleteMany({ where: { repositoryId: repo.id, path: change.path } }), prisma.repoChunk.createMany({ data: rows })])
  state.chunks += rows.length - before
  if (store) state.processed++
  else state.skipped++
}

async function finish(repo: RepoRow, head: string | null, state: PassState, empty: boolean): Promise<IndexResult> {
  if (empty) await prisma.repoChunk.deleteMany({ where: { repositoryId: repo.id } })
  const files = empty ? 0 : await prisma.repoChunk.count({ where: { repositoryId: repo.id, chunkNo: 0 } })
  await prisma.gitRepository.update({
    where: { id: repo.id },
    data: { indexedSha: head, indexedAt: new Date(), indexedFiles: files, indexTargetSha: null, indexCursor: null, indexError: null, indexErrorAt: null },
  })
  publishAfterCommit({ type: "git", projectId: repo.projectId, action: "index" })
  log.info("repository indexed", { repositoryId: repo.id, files, processed: state.processed, skipped: state.skipped })
  return { repositoryId: repo.id, status: "done", processed: state.processed, skipped: state.skipped }
}
