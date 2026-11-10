import { GitLabError } from "@/lib/git/gitlab-client"
import { logger } from "@/lib/logger"
import { defaultClientFactory, syncErrorMessage, type ClientFactory } from "./gitlab-source"
import { gitBlobSha, planFromCompare, planFromTree, MAX_INDEX_FILES, type FileChange } from "./repo-index-plan"
import type { FileKind } from "./repo-index-rules"

/**
 * Where an index pass reads a repository from (AI の参照資料). repo-index.ts runs the pass — resume
 * cursor, redaction, chunking, the atomic swap of a file's passages — the same way for every source;
 * a source answers only "what is the head", "what changed", "give me this file" and "what does this
 * error say". GitLab is below; GitStation is gitstation-files.ts.
 */

/** Why a file planned for indexing was not stored (counted per reason; never an error of the pass). */
export type SkipReason = "too_large" | "not_found" | "binary" | "confidential" | "unsupported_kind" | "not_a_file"

export type ReadResult =
  | { kind: "ok"; data: Buffer; blobSha: string }
  /** `requested`: a request was sent (the pass pauses after it). */
  | { kind: "skipped"; reason: SkipReason; requested: boolean }

export interface PlanContext {
  /** The commit the stored passages are from (null = first pass). */
  indexedSha: string | null
  /** Re-check what is stored although the branch did not move (the source decides how; see `recheckDue`). */
  recheck: boolean
  /** Folder filter ("docs/"), empty = whole repository. */
  prefixes: readonly string[]
  include(path: string): boolean
  /** path → stored blob id (first chunk of each file). */
  stored(): Promise<Map<string, string>>
  /** Epoch ms after which listing work stops. */
  deadline?: number
}

export interface IndexPlan {
  /** Sorted by path. */
  changes: FileChange[]
  /** false = the listing could not see every folder (stored as a warning); undefined = this plan did not list. */
  listingComplete?: boolean
}

export interface IndexSource {
  /** Newest commit of the default branch; null = empty repository. */
  head(): Promise<string | null>
  /** The changes from the indexed commit to `head`. The same for one (indexedSha, head, stored). */
  plan(head: string, ctx: PlanContext): Promise<IndexPlan>
  read(path: string, head: string, decision: { kind: FileKind; maxBytes: number }): Promise<ReadResult>
  /** A pass is due although the branch did not move (stored content may have changed status on the server). */
  recheckDue(indexedAt: Date | null, now: Date): boolean
  /** The error means this project may no longer hold the repository's content: its passages are removed. */
  purgesOn(err: unknown): boolean
  /** The stored (Japanese) text of one of this source's errors; null = not this source's error. */
  errorMessage(err: unknown): string | null
}

/** The branch moved during the pass: the pass pauses, the next call plans again against the new head. */
export class PassInterrupted extends Error {
  constructor(readonly why: "head_moved") {
    super(`index pass interrupted: ${why}`)
    this.name = "PassInterrupted"
  }
}

const log = logger.child({ module: "repo-index" })

/** Recursive tree pages (100 entries each; directories count too). */
const TREE_MAX_PAGES = 40

export interface GitLabRepoRef {
  id: string
  apiBase: string
  repoPath: string
  externalId: number | null
}

/** The GitLab API (one request when nothing changed; compare, else the recursive tree). */
export function gitLabIndexSource(repo: GitLabRepoRef, token: string, factory: ClientFactory = defaultClientFactory): IndexSource {
  const client = factory(repo.apiBase, token)
  let externalId = repo.externalId
  const project = async () => (externalId ??= (await client.getProject(repo.repoPath)).id)

  return {
    async head() {
      return client.latestCommitSha(await project())
    },

    async plan(head, ctx) {
      const id = await project()
      if (ctx.indexedSha) {
        try {
          const cmp = await client.compare(id, ctx.indexedSha, head)
          const changes = cmp.compare_timeout ? null : planFromCompare(cmp.diffs, (p) => ctx.include(p))
          if (changes) return { changes }
        } catch (err) {
          // Only a vanished / unusable base commit (404, other HTTP errors) means "start over". Token problems,
          // rate limits and network trouble fail the pass instead: a full tree scan would only add load.
          if (!(err instanceof GitLabError) || ["auth", "forbidden", "rate_limited", "network"].includes(err.kind)) throw err
        }
      }
      const tree = await client.listTree(id, head, TREE_MAX_PAGES)
      const { changes, truncated } = planFromTree(tree, await ctx.stored(), (p) => ctx.include(p))
      if (truncated) log.warn("repository has more files than the index keeps", { repositoryId: repo.id, max: MAX_INDEX_FILES })
      return { changes }
    },

    async read(path, head, decision) {
      try {
        const raw = await client.rawFile(await project(), path, head, decision.maxBytes)
        return raw.kind === "ok" ? { kind: "ok", data: raw.data, blobSha: gitBlobSha(raw.data) } : { kind: "skipped", reason: "too_large", requested: true }
      } catch (err) {
        if (err instanceof GitLabError && err.kind === "not_found") return { kind: "skipped", reason: "not_found", requested: true }
        throw err
      }
    },

    // GitLab has no per-file access rule that changes without a commit.
    recheckDue: () => false,
    purgesOn: () => false,
    errorMessage: (err) => (err instanceof GitLabError ? syncErrorMessage(err) : null),
  }
}
