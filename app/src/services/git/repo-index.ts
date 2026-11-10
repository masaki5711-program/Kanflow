import { prisma } from "@/lib/prisma"
import { open } from "@/lib/secret-box"
import { INDEX_FAILED_MESSAGE, INDEX_TOKEN_MISSING_MESSAGE, KNOWLEDGE_LISTING_INCOMPLETE_MESSAGE } from "@/lib/git/sync-messages"
import { logger } from "@/lib/logger"
import { publishAfterCommit } from "@/lib/realtime/after-commit"
import { devSourceFor } from "./dev-source"
import { readableProvider, UnsupportedProviderError } from "./git-provider"
import type { ClientFactory } from "./gitlab-source"
import type { GitStationClientFactory } from "./gitstation-source"
import { stationIndexSource } from "./gitstation-files"
import { chunkFile } from "./repo-chunker"
import { fileText } from "./repo-index-content"
import { remainingAfter, type FileChange } from "./repo-index-plan"
import { decideFile, parsePathFilter } from "./repo-index-rules"
import { gitLabIndexSource, PassInterrupted, type IndexSource, type SkipReason } from "./repo-index-source"

/**
 * Knowledge index of one repository ("AI の参照資料として使う"), from its Git server (GitLab or
 * GitStation, repo-index-source.ts / gitstation-files.ts).
 *
 * Each call costs a few requests when nothing changed (newest commit = indexed commit). Otherwise the
 * files changed since the indexed commit (compare) — or, on the first pass / after a filter change /
 * when the compare cannot be used, every file of the tree whose blob id differs — are downloaded one by
 * one, turned into chunks and stored. A pass stops at its deadline / download budget and resumes after
 * the last finished path on the next call. File contents and the token are never logged.
 */
const log = logger.child({ module: "repo-index" })

/** Download budget of one call; the rest of the pass continues next time. */
const MAX_PASS_BYTES = 150 * 1024 * 1024
/** Stored passages per repository. */
export const MAX_CHUNKS_PER_REPO = 30_000
/** Gap between file downloads (keeps the request rate modest, yields the event loop). */
const DEFAULT_PAUSE_MS = 100

export type IndexStatus = "disabled" | "up_to_date" | "done" | "partial" | "failed"

/** Why files were not stored: the source's reasons, plus unreadable content and the repository cap. */
export type SkippedBy = Partial<Record<SkipReason | "content" | "cap", number>>

export interface IndexResult {
  repositoryId: string
  status: IndexStatus
  /** Files written or removed by this call. */
  processed: number
  skipped: number
  error?: string
}

export interface IndexOptions {
  /** GitLab client factory (tests). */
  factory?: ClientFactory
  /** GitStation client factory (tests). */
  stationFactory?: GitStationClientFactory
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

/** A source kind that cannot read repository files (none today; kept for a future kind). */
export const KNOWLEDGE_UNSUPPORTED_MESSAGE = "この取り込み元のリポジトリは、AI の参照資料に使えません。"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function indexRepository(repositoryId: string, opts: IndexOptions = {}): Promise<IndexResult> {
  const repo = await loadRepo(repositoryId)
  const integration = repo?.project.gitIntegration
  const base = { repositoryId, processed: 0, skipped: 0 }
  if (!repo || repo.project.deletedAt || !integration?.enabled || !repo.aiKnowledge) return { ...base, status: "disabled" }
  // Only a source that can read repository files is indexed; nothing is ever sent to another source instead.
  const provider = readableProvider(repositoryId, integration.provider, "index")
  if (!provider) return fail(repo, new UnsupportedProviderError(integration.provider).message)
  if (!devSourceFor(provider).readsRepositoryFiles) return fail(repo, KNOWLEDGE_UNSUPPORTED_MESSAGE)
  const sealed = repo.tokenCipher ?? integration.tokenCipher
  const token = sealed ? open(sealed) : null
  if (!token) return fail(repo, INDEX_TOKEN_MISSING_MESSAGE)
  const source: IndexSource =
    provider === "gitstation"
      ? stationIndexSource(
          { repositoryId: repo.id, projectId: repo.projectId, apiBase: repo.apiBase, repoPath: repo.repoPath, externalId: repo.externalId, token, stationIntegrationId: integration.stationIntegrationId },
          opts.stationFactory,
        )
      : gitLabIndexSource(repo, token, opts.factory)
  try {
    const head = await source.head()
    const unchanged = head ? head === repo.indexedSha : repo.indexedAt !== null && repo.indexedSha === null
    // Re-check what is stored although the branch did not move (GitStation: documents can become confidential).
    const recheck = head !== null && head === repo.indexedSha && (repo.indexTargetSha === head || source.recheckDue(repo.indexedAt, new Date()))
    if (unchanged && !repo.indexTargetSha && !recheck) {
      // The server answered and the index is current: an old error (e.g. a network blip) is over, so stop
      // showing it — but an incomplete listing stays until a complete one clears it.
      if (repo.indexError && repo.indexError !== KNOWLEDGE_LISTING_INCOMPLETE_MESSAGE) await clearIndexError(repo)
      return { ...base, status: "up_to_date" }
    }
    return await runPass(repo, source, head, recheck, opts)
  } catch (err) {
    const known = source.errorMessage(err)
    if (known) log.warn("repository index failed", { repositoryId, ...errorFacts(err) })
    else log.error("repository index failed", { repositoryId, error: err instanceof Error ? err.message : String(err) })
    if (source.purgesOn(err)) await purge(repo)
    return fail(repo, known ?? INDEX_FAILED_MESSAGE)
  }
}

/** What a log line may say about a source error (kind, status, code — never a body or the token). */
function errorFacts(err: unknown): Record<string, unknown> {
  if (!(err instanceof Error)) return {}
  const e = err as Error & { kind?: unknown; status?: unknown; detail?: { errorCode?: unknown; reason?: unknown } }
  return { name: e.name, kind: e.kind, status: e.status, errorCode: e.detail?.errorCode, reason: e.detail?.reason }
}

/** The project may no longer hold this repository's content: every passage goes, and the next pass starts over. */
async function purge(repo: RepoRow): Promise<void> {
  const { count } = await prisma.repoChunk.deleteMany({ where: { repositoryId: repo.id } })
  await prisma.gitRepository.update({ where: { id: repo.id }, data: { indexedSha: null, indexedFiles: 0, indexTargetSha: null, indexCursor: null } })
  log.warn("repository knowledge removed: no longer bound to this project", { repositoryId: repo.id, chunks: count })
}

async function clearIndexError(repo: RepoRow): Promise<void> {
  await prisma.gitRepository.update({ where: { id: repo.id }, data: { indexError: null, indexErrorAt: null } }).catch(() => undefined)
  publishAfterCommit({ type: "git", projectId: repo.projectId, action: "index" })
}

async function fail(repo: RepoRow, message: string): Promise<IndexResult> {
  await prisma.gitRepository
    .update({ where: { id: repo.id }, data: { indexError: message.slice(0, 500), indexErrorAt: new Date() } })
    .catch((err: unknown) => log.warn("repository index error not stored", { repositoryId: repo.id, error: err instanceof Error ? err.message : String(err) }))
  publishAfterCommit({ type: "git", projectId: repo.projectId, action: "index" })
  return { repositoryId: repo.id, status: "failed", processed: 0, skipped: 0, error: message }
}

/** path → blob id of the files stored now (first chunk of each). */
async function storedBlobs(repositoryId: string): Promise<Map<string, string>> {
  const rows = await prisma.repoChunk.findMany({ where: { repositoryId, chunkNo: 0 }, select: { path: true, blobSha: true } })
  return new Map(rows.map((r) => [r.path, r.blobSha]))
}

interface PassState {
  processed: number
  skipped: number
  skippedBy: SkippedBy
  bytes: number
  chunks: number
}

async function runPass(repo: RepoRow, source: IndexSource, head: string | null, recheck: boolean, opts: IndexOptions): Promise<IndexResult> {
  const state: PassState = { processed: 0, skipped: 0, skippedBy: {}, bytes: 0, chunks: 0 }
  if (!head) return finish(repo, null, state, true, true)
  const prefixes = parsePathFilter(repo.aiPathFilter) ?? []
  const include = (p: string) => decideFile(p, prefixes).index
  const resumeCursor = repo.indexTargetSha === head ? repo.indexCursor : null
  if (repo.indexTargetSha !== head) {
    await prisma.gitRepository.update({ where: { id: repo.id }, data: { indexTargetSha: head, indexCursor: null } })
  }
  const paused = () => ({ repositoryId: repo.id, status: "partial" as const, processed: state.processed, skipped: state.skipped })
  let listingComplete: boolean | undefined
  try {
    const plan = await source.plan(head, { indexedSha: repo.indexedSha, recheck, prefixes, include, stored: () => storedBlobs(repo.id), deadline: opts.deadline })
    listingComplete = plan.listingComplete
    const todo = remainingAfter(plan.changes, resumeCursor)
    state.chunks = await prisma.repoChunk.count({ where: { repositoryId: repo.id } })
    let done = 0
    for (const change of todo) {
      // At least one change per call: a plan that used up the time on its own must still move the cursor.
      if (done > 0 && ((opts.deadline !== undefined && Date.now() > opts.deadline) || state.bytes > MAX_PASS_BYTES)) return paused()
      const requested = await applyChange(repo, source, head, prefixes, change, state)
      await prisma.gitRepository.update({ where: { id: repo.id }, data: { indexCursor: change.path } })
      done++
      if (requested) await sleep(opts.pauseMs ?? DEFAULT_PAUSE_MS)
    }
  } catch (err) {
    if (!(err instanceof PassInterrupted)) throw err
    // The branch moved under the pass: nothing more is written for the old head; the next call plans against the new one.
    log.warn("repository index paused: branch moved", { repositoryId: repo.id, processed: state.processed })
    return paused()
  }
  return finish(repo, head, state, false, listingComplete)
}

async function removeFile(repositoryId: string, path: string): Promise<number> {
  return (await prisma.repoChunk.deleteMany({ where: { repositoryId, path } })).count
}

const countSkip = (state: PassState, reason: keyof SkippedBy) => {
  state.skipped++
  state.skippedBy[reason] = (state.skippedBy[reason] ?? 0) + 1
}

/** One change of the plan; true when a file was requested from the server (the pass pauses after it). */
async function applyChange(repo: RepoRow, source: IndexSource, head: string, prefixes: string[], change: FileChange, state: PassState): Promise<boolean> {
  const decision = decideFile(change.path, prefixes)
  if (change.op === "delete" || !decision.index) {
    state.chunks -= await removeFile(repo.id, change.path)
    state.processed++
    return false
  }
  const read = await source.read(change.path, head, decision)
  const content = read.kind === "ok" ? await fileText(change.path, decision.kind, read.data) : null
  const chunks = read.kind === "ok" && content?.ok ? chunkFile(change.path, content.text, decision.kind === "text") : []
  if (read.kind === "ok") state.bytes += read.data.byteLength
  const before = await prisma.repoChunk.count({ where: { repositoryId: repo.id, path: change.path } })
  const fits = state.chunks - before + chunks.length <= MAX_CHUNKS_PER_REPO
  // Too large / binary / confidential / unreadable / over the repository cap: the file's old passages go, nothing new is stored.
  const store = read.kind === "ok" && chunks.length > 0 && fits
  const blobSha = read.kind === "ok" ? read.blobSha : ""
  const rows = store
    ? chunks.map((c, chunkNo) => ({ repositoryId: repo.id, projectId: repo.projectId, path: change.path, heading: c.heading, anchor: c.anchor, chunkNo, content: c.content, blobSha }))
    : []
  // Old passages are replaced atomically: a search never sees a half-written file.
  await prisma.$transaction([prisma.repoChunk.deleteMany({ where: { repositoryId: repo.id, path: change.path } }), prisma.repoChunk.createMany({ data: rows })])
  state.chunks += rows.length - before
  if (store) state.processed++
  else countSkip(state, read.kind === "skipped" ? read.reason : chunks.length > 0 ? "cap" : "content")
  return read.kind === "ok" || read.requested
}

/**
 * The pass is finished. `listingComplete` false stores the incomplete-listing warning; undefined (the plan did not
 * list, e.g. a compare) keeps that warning if it was there — only a complete listing proves it is over.
 */
async function finish(repo: RepoRow, head: string | null, state: PassState, empty: boolean, listingComplete: boolean | undefined): Promise<IndexResult> {
  if (empty) await prisma.repoChunk.deleteMany({ where: { repositoryId: repo.id } })
  const files = empty ? 0 : await prisma.repoChunk.count({ where: { repositoryId: repo.id, chunkNo: 0 } })
  const incomplete = listingComplete === false || (listingComplete === undefined && repo.indexError === KNOWLEDGE_LISTING_INCOMPLETE_MESSAGE)
  const warning = incomplete ? { indexError: KNOWLEDGE_LISTING_INCOMPLETE_MESSAGE, indexErrorAt: new Date() } : { indexError: null, indexErrorAt: null }
  await prisma.gitRepository.update({
    where: { id: repo.id },
    data: { indexedSha: head, indexedAt: new Date(), indexedFiles: files, indexTargetSha: null, indexCursor: null, ...warning },
  })
  publishAfterCommit({ type: "git", projectId: repo.projectId, action: "index" })
  log.info("repository indexed", { repositoryId: repo.id, files, processed: state.processed, skipped: state.skipped, skippedBy: state.skippedBy, listingIncomplete: incomplete })
  return { repositoryId: repo.id, status: "done", processed: state.processed, skipped: state.skipped }
}
