import { GitStationError, type GitStationClient } from "@/lib/git/gitstation-client"
import { CONFIDENTIAL_CODES, parseBlob, parseCompare, parseRefs, parseTree, type StationDiffFile, type StationTreeEntry } from "@/lib/git/gitstation-browse"
import { KNOWLEDGE_LISTING_SLOW_MESSAGE } from "@/lib/git/sync-messages"
import { logger } from "@/lib/logger"
import type { DevConnection } from "./dev-source"
import {
  createGitStationSource,
  defaultGitStationClientFactory,
  gitStationErrorMessage,
  MissingIntegrationError,
  NotBoundError,
  stationClientFor,
  type GitStationClientFactory,
} from "./gitstation-source"
import { PassInterrupted, type IndexPlan, type IndexSource, type PlanContext, type ReadResult } from "./repo-index-source"
import { dedupe, planFromTree, MAX_COMPARE_FILES, MAX_INDEX_FILES, type FileChange } from "./repo-index-plan"
import { wantsDirectory } from "./repo-index-rules"

/**
 * AI の参照資料 from a GitStation repository, through its browse API (`/repository/refs|tree|blob|compare`,
 * GitStation main 059cc34). Same pass as GitLab (repo-index.ts); what differs:
 *
 * - Every call first checks that GitStation binds the repository, for this integration, to exactly this
 *   Kanflow project (`locate`): the token is shared by all projects of the integration.
 * - Files are read by the branch NAME (`refs/heads/<default>`): GitStation rations lookups by commit id.
 *   Each answer names the commit it was computed at; another commit than the head read at the start
 *   means the branch moved, and the pass pauses (PassInterrupted) instead of mixing two commits.
 * - Confidential documents are refused to a service account (403 FG-AUTH-0021). Such a file is skipped
 *   and its stored passages are removed — it never reaches repo_chunk, so never the chat.
 * - The tree is listed one folder per request (no recursive listing). A listing that is incomplete
 *   (a level over GitStation's cap, or more folders than WALK_MAX_DIRS) never deletes a stored file it
 *   could not see.
 * - A document can become confidential without its own content changing (a doctype default under
 *   `.forge/`, the original of a translation, a document GitStation stops reading at its bound). Every
 *   walk therefore reads every stored Markdown file again, so GitStation refuses it and its passages
 *   go; a walk runs when the compare cannot be trusted for that (truncated, documents withheld, `.forge/`
 *   changed, or unusable) and at least every RECHECK_INTERVAL_MS even when the branch did not move.
 * - A repository GitStation no longer binds to this project loses its stored passages (`purgesOn`).
 */
const log = logger.child({ module: "repo-index" })

/** Folders listed per call (proposal sized for the 90 s tick; a larger repository needs the folder filter). */
export const WALK_MAX_DIRS = 600
/** GitStation's blob cap: a larger file comes back cut, so it is not requested at all. */
export const STATION_BLOB_MAX_BYTES = 1024 * 1024
/** Stored Markdown is checked against GitStation's confidential rules at least this often. */
export const RECHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

/** A path with a control character (git allows newlines) is never indexed: it would reach the chat's tool output as text. */
const safePath = (path: string) => !/[\u0000-\u001f\u007f]/.test(path)

/** The folder walk did not finish before the call's deadline: a real failure (a `partial` forever would hide it). */
export class GitStationListingSlowError extends Error {
  constructor() {
    super("GitStation repository listing did not finish in time")
    this.name = "GitStationListingSlowError"
  }
}

type NameKind = "tree" | "file" | "other"

/** What one listed folder showed: `complete` = GitStation listed all of its entries. */
export interface ListedDir {
  complete: boolean
  names: ReadonlyMap<string, NameKind>
}

/**
 * Whether `path` is known NOT to exist at the head: walking its folders from the root, some folder was
 * listed completely and lacks the next segment (as that kind). A path under a folder that was not listed,
 * or listed only partly, is not decided — it must not be deleted on that evidence.
 */
export function decidedAbsent(path: string, listed: ReadonlyMap<string, ListedDir>): boolean {
  const segments = path.split("/")
  let dir = ""
  for (let i = 0; i < segments.length; i++) {
    const listing = listed.get(dir)
    if (!listing) return false
    const last = i === segments.length - 1
    const kind = listing.names.get(segments[i])
    if (kind !== (last ? "file" : "tree")) return listing.complete
    if (last) return false
    dir = dir ? `${dir}/${segments[i]}` : segments[i]
  }
  return false
}

/** Incremental plan from a GitStation compare (null = too many files: walk instead). Sorted by path. */
export function planFromStationCompare(files: readonly StationDiffFile[], include: (path: string) => boolean): FileChange[] | null {
  if (files.length >= MAX_COMPARE_FILES) return null
  const changes: FileChange[] = []
  for (const f of files) {
    if ([f.oldPath, f.newPath].some((p) => p !== null && !safePath(p))) continue
    if (f.status === "deleted") {
      if (f.oldPath) changes.push({ op: "delete", path: f.oldPath })
      continue
    }
    if (f.status === "renamed" && f.oldPath && f.oldPath !== f.newPath) changes.push({ op: "delete", path: f.oldPath })
    if (f.newPath) changes.push(include(f.newPath) ? { op: "upsert", path: f.newPath } : { op: "delete", path: f.newPath })
  }
  return dedupe(changes)
}

const touchesForge = (f: StationDiffFile) => [f.oldPath, f.newPath].some((p) => p !== null && (p === ".forge" || p.startsWith(".forge/")))
const isMarkdown = (path: string) => /\.(md|markdown)$/i.test(path)

export interface WalkResult {
  /** Files (blobs) of the folders entered. */
  files: StationTreeEntry[]
  listed: Map<string, ListedDir>
  truncatedLevels: number
  unvisitedDirs: number
}

interface WalkDeps {
  /** One folder of the head ("" = root); throws PassInterrupted when the answer is of another commit. */
  list(dirPath: string): Promise<{ entries: StationTreeEntry[]; truncated: boolean }>
  prefixes: readonly string[]
  maxDirs: number
  deadline?: number
}

/** Depth-first, one request per folder, only folders the rules could index from. */
export async function walkTree({ list, prefixes, maxDirs, deadline }: WalkDeps): Promise<WalkResult> {
  const files: StationTreeEntry[] = []
  const listed = new Map<string, ListedDir>()
  const stack = [""]
  let truncatedLevels = 0
  let visited = 0
  while (stack.length > 0) {
    if (visited >= maxDirs) break
    if (deadline !== undefined && Date.now() > deadline) throw new GitStationListingSlowError()
    const dir = stack.pop() as string
    const answer = await list(dir)
    visited++
    if (answer.truncated) truncatedLevels++
    const names = new Map<string, NameKind>()
    const subdirs: string[] = []
    for (const e of answer.entries) {
      names.set(e.name, e.type === "tree" ? "tree" : e.type === "blob" ? "file" : "other")
      // Not a file to index and not a folder to enter (its listed name still counts for `decidedAbsent`).
      if (!safePath(e.path)) continue
      if (e.type === "blob") files.push(e)
      else if (e.type === "tree" && wantsDirectory(e.path, prefixes)) subdirs.push(e.path)
    }
    listed.set(dir, { complete: !answer.truncated, names })
    // Reverse so the stack visits folders in listing order (keeps request order stable for tests and logs).
    for (let i = subdirs.length - 1; i >= 0; i--) stack.push(subdirs[i])
  }
  return { files, listed, truncatedLevels, unvisitedDirs: stack.length }
}

/** The head of the default branch: its full ref name and commit; null = empty repository or branch not born. */
interface StationHead {
  ref: string
  commit: string
}

export function stationIndexSource(connection: DevConnection, factory: GitStationClientFactory = defaultGitStationClientFactory): IndexSource {
  let client: GitStationClient | null = null
  let projectId: number | null = null
  let ref: string | null = null
  /** Sizes from the walk (a file over GitStation's blob cap is not requested). */
  const sizes = new Map<string, number | null>()

  const station = () => (client ??= stationClientFor(connection, factory))
  const located = (): number => {
    if (projectId === null) throw new Error("GitStation index source used before head()")
    return projectId
  }

  /**
   * Only GitStation saying "no default branch" means an empty repository (all passages go). A default branch it
   * names but cannot show is a failure, never "empty": one odd answer must not wipe the knowledge base.
   */
  async function readHead(id: number): Promise<StationHead | null> {
    const refs = parseRefs(await station().repositoryGet(id, "refs", { type: "branch" }))
    if (refs.defaultBranch === null) return null
    const full = `refs/heads/${refs.defaultBranch}`
    const found = refs.refs.find((r) => r.fullName === full || (r.fullName === null && r.name === refs.defaultBranch))
    if (found?.commit) return { ref: full, commit: found.commit }
    if (found || !refs.truncated) throw new GitStationError("not_found", "GitStation names a default branch it does not list (404)", 404)
    // Not in a cut-short listing: ask for the branch itself (a 404 fails the pass).
    return { ref: full, commit: parseTree(await station().repositoryGet(id, "tree", { ref: full })).ref.commit }
  }

  /** After a 404 at the head: the branch moved (pause) or the thing is really not there. */
  async function movedSince(head: string): Promise<boolean> {
    const now = await readHead(located())
    return now?.commit !== head
  }

  async function listDir(head: string, dirPath: string): Promise<{ entries: StationTreeEntry[]; truncated: boolean }> {
    try {
      const tree = parseTree(await station().repositoryGet(located(), "tree", { ref: ref ?? undefined, path: dirPath || undefined }))
      if (tree.ref.commit !== head) throw new PassInterrupted("head_moved")
      return { entries: tree.entries, truncated: tree.truncated }
    } catch (err) {
      if (err instanceof GitStationError && err.kind === "not_found" && (await movedSince(head))) throw new PassInterrupted("head_moved")
      throw err
    }
  }

  async function walkPlan(head: string, ctx: PlanContext): Promise<IndexPlan> {
    const walk = await walkTree({ list: (dir) => listDir(head, dir), prefixes: ctx.prefixes, maxDirs: WALK_MAX_DIRS, deadline: ctx.deadline })
    for (const f of walk.files) sizes.set(f.path, f.size)
    const stored = await ctx.stored()
    // Every walk reads stored Markdown again even when its content did not change (it may have become confidential).
    const compared = new Map([...stored].map(([p, sha]) => [p, isMarkdown(p) ? "" : sha]))
    const { changes, truncated } = planFromTree(
      walk.files.map((f) => ({ id: f.oid, path: f.path, type: "blob" as const })),
      compared,
      (p) => ctx.include(p),
    )
    const complete = walk.truncatedLevels === 0 && walk.unvisitedDirs === 0
    if (!complete) log.warn("repository listing is incomplete", { repositoryId: connection.repositoryId, truncatedLevels: walk.truncatedLevels, unvisitedDirs: walk.unvisitedDirs })
    if (truncated) log.warn("repository has more files than the index keeps", { repositoryId: connection.repositoryId, max: MAX_INDEX_FILES })
    // A stored file the listing could not see is kept: only an excluded file or one proven absent is deleted.
    const kept = complete ? changes : changes.filter((c) => c.op === "upsert" || !ctx.include(c.path) || decidedAbsent(c.path, walk.listed))
    return { changes: kept, listingComplete: complete }
  }

  /** The compare's plan, or null when it cannot be trusted (walk with recheck instead). */
  async function comparePlan(head: string, ctx: PlanContext & { indexedSha: string }): Promise<FileChange[] | null> {
    let cmp
    try {
      cmp = parseCompare(await station().repositoryGet(located(), "compare", { from: ctx.indexedSha, to: ref ?? undefined }))
    } catch (err) {
      // Token, permission, load and network problems fail the pass (a walk would only add load); a base commit
      // gone (404) or an answer Kanflow cannot use (too large, odd shape, other status) walks instead.
      if (!(err instanceof GitStationError) || ["auth", "forbidden", "rate_limited", "unavailable", "network", "host_not_allowed"].includes(err.kind)) throw err
      log.warn("repository compare not usable, listing instead", { repositoryId: connection.repositoryId, kind: err.kind, status: err.status, errorCode: err.detail.errorCode, reason: err.detail.reason })
      return null
    }
    if (cmp.to.commit !== head) throw new PassInterrupted("head_moved")
    if (cmp.truncated || cmp.withheld || cmp.files.some(touchesForge)) return null
    return planFromStationCompare(cmp.files, (p) => ctx.include(p))
  }

  return {
    async head() {
      // The binding check runs on every call: without it a project could index a repository bound elsewhere.
      projectId = await createGitStationSource(connection, factory).locate()
      const head = await readHead(projectId)
      ref = head?.ref ?? null
      return head?.commit ?? null
    },

    async plan(head, ctx) {
      if (ctx.indexedSha && !ctx.recheck) {
        const changes = await comparePlan(head, { ...ctx, indexedSha: ctx.indexedSha })
        if (changes) return { changes }
      }
      return walkPlan(head, ctx)
    },

    recheckDue: (indexedAt, now) => indexedAt !== null && now.getTime() - indexedAt.getTime() > RECHECK_INTERVAL_MS,

    // Not bound to this project (any more): its content is no longer this project's to hold.
    purgesOn: (err) => err instanceof NotBoundError,

    async read(path, head, decision): Promise<ReadResult> {
      // GitStation's blob route is text only: Office / PDF come back without content.
      if (decision.kind === "office") return { kind: "skipped", reason: "unsupported_kind", requested: false }
      const size = sizes.get(path)
      if (size !== undefined && size !== null && size > Math.min(STATION_BLOB_MAX_BYTES, decision.maxBytes)) return { kind: "skipped", reason: "too_large", requested: false }
      let blob
      try {
        blob = parseBlob(await station().repositoryGet(located(), "blob", { ref: ref ?? undefined, path }))
      } catch (err) {
        if (err instanceof GitStationError) {
          if (err.kind === "forbidden" && err.detail.errorCode && CONFIDENTIAL_CODES.includes(err.detail.errorCode)) return { kind: "skipped", reason: "confidential", requested: true }
          if (err.kind === "invalid_response" && err.detail.reason === "response_too_large") return { kind: "skipped", reason: "too_large", requested: true }
          if (err.kind === "not_found") {
            if (await movedSince(head)) throw new PassInterrupted("head_moved")
            return { kind: "skipped", reason: "not_found", requested: true }
          }
        }
        throw err
      }
      if (blob.ref.commit !== head) throw new PassInterrupted("head_moved")
      if (blob.type !== "blob") return { kind: "skipped", reason: "not_a_file", requested: true }
      if (blob.truncated || blob.size > decision.maxBytes) return { kind: "skipped", reason: "too_large", requested: true }
      if (blob.binary || blob.content === null) return { kind: "skipped", reason: "binary", requested: true }
      // The answer's object id (not a hash of the text): it is what the tree lists, also in a SHA-256 repository.
      return { kind: "ok", data: Buffer.from(blob.content, "utf8"), blobSha: blob.oid }
    },

    errorMessage(err) {
      if (err instanceof GitStationListingSlowError) return KNOWLEDGE_LISTING_SLOW_MESSAGE
      if (err instanceof GitStationError || err instanceof NotBoundError || err instanceof MissingIntegrationError) return gitStationErrorMessage(err)
      return null
    },
  }
}
