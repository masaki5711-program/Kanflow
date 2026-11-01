/**
 * Minimal GitLab REST v4 client for the read-only polling sync (read_api scope).
 * Every call has a timeout and bounded pagination; errors are mapped to
 * GitLabError kinds the settings UI can explain.
 */
/** auth = 401 (token invalid / expired); forbidden = 403 (valid token, but its owner may not read this). */
export type GitLabErrorKind = "auth" | "forbidden" | "not_found" | "rate_limited" | "network" | "http"

export class GitLabError extends Error {
  constructor(
    readonly kind: GitLabErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = "GitLabError"
  }
}

export interface GitLabProject {
  id: number
  web_url: string
  path_with_namespace: string
  default_branch: string | null
  /** The token owner's role (10 Guest, 20 Reporter, 30 Developer …); absent for admin / some tokens. */
  permissions?: {
    project_access?: { access_level?: number } | null
    group_access?: { access_level?: number } | null
  } | null
}

/** GitLab role of the token owner on the project (highest of project / group), or null when unknown. */
export function accessLevelOf(p: Pick<GitLabProject, "permissions">): number | null {
  const levels = [p.permissions?.project_access?.access_level, p.permissions?.group_access?.access_level].filter((n): n is number => typeof n === "number")
  return levels.length > 0 ? Math.max(...levels) : null
}

/** Reporter: the lowest role that can read code and merge requests of a private project. */
export const REPORTER_ACCESS_LEVEL = 20

export interface GitLabMergeRequest {
  iid: number
  title: string
  description: string | null
  state: string
  web_url: string
  source_branch: string
  updated_at: string
  merged_at: string | null
  author?: { name?: string; username?: string } | null
}

export interface GitLabBranch {
  name: string
  web_url: string
  commit?: { committed_date?: string; author_name?: string; title?: string } | null
}

export interface GitLabCommit {
  id: string
  short_id: string
  title: string
  message: string
  web_url: string
  author_name: string
  committed_date: string
}

export interface GitLabTag {
  name: string
  commit?: { committed_date?: string; created_at?: string } | null
}

export interface GitLabRelease {
  tag_name: string
  name: string | null
  description: string | null
  released_at: string | null
  created_at?: string | null
}

/** One entry of a recursive repository tree listing. */
export interface GitLabTreeEntry {
  id: string
  path: string
  type: "blob" | "tree" | "commit"
}

/** One changed file of a compare (the diff text itself is ignored). */
export interface GitLabDiffEntry {
  old_path: string
  new_path: string
  new_file: boolean
  renamed_file: boolean
  deleted_file: boolean
}

export interface GitLabCompare {
  diffs: GitLabDiffEntry[]
  compare_timeout?: boolean
}

/** Raw file download: the bytes, or "too_large" when it exceeds the caller's limit. */
export type RawFileResult = { kind: "ok"; data: Buffer } | { kind: "too_large" }

const TIMEOUT_MS = 15_000
/** Raw files and compares can be bigger than JSON listings. */
const DOWNLOAD_TIMEOUT_MS = 60_000
const PER_PAGE = 100

type FetchLike = typeof fetch

/** One bounded listing: `truncated` = stopped at the page cap while GitLab had more. */
export interface Paged<T> {
  items: T[]
  truncated: boolean
  /** Pages actually requested. */
  pages: number
}

/** One page of merge requests (the sync pages by its own cursor, see services/git/git-sync-cursors). */
export interface MergeRequestPage {
  items: GitLabMergeRequest[]
  /** GitLab reported another page for the same query. */
  hasMore: boolean
  /** GitLab's clock (the response Date header), or null when absent / unparsable. */
  serverTime: Date | null
}

/** Query of one merge request page: everything updated on or after `updatedAfter`, oldest change first. */
export interface MergeRequestPageQuery {
  updatedAfter: Date
  page?: number
  perPage?: number
}

export interface GitLabClientOptions {
  apiBase: string
  token: string
  fetchImpl?: FetchLike
  timeoutMs?: number
}

export function createGitLabClient({ apiBase, token, fetchImpl = fetch, timeoutMs = TIMEOUT_MS }: GitLabClientOptions) {
  type Query = Record<string, string | number | boolean | undefined>

  /** GET with the token header, a timeout and GitLab status codes mapped to GitLabError kinds. */
  async function send(path: string, query: Query, accept: string, ms: number): Promise<Response> {
    const url = new URL(`${apiBase}/api/v4${path}`)
    for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, String(v))
    let res: Response
    try {
      res = await fetchImpl(url, { headers: { "PRIVATE-TOKEN": token, Accept: accept }, signal: AbortSignal.timeout(ms), cache: "no-store" })
    } catch (err) {
      throw new GitLabError("network", `GitLab unreachable: ${err instanceof Error ? err.message : String(err)}`)
    }
    if (res.status === 401) throw new GitLabError("auth", "GitLab rejected the token (401)", 401)
    if (res.status === 403) throw new GitLabError("forbidden", "The token owner may not read this (403)", 403)
    if (res.status === 404) throw new GitLabError("not_found", "Repository not found or not visible to this token", 404)
    if (res.status === 429) throw new GitLabError("rate_limited", "GitLab rate limit reached", 429)
    if (!res.ok) throw new GitLabError("http", `GitLab responded ${res.status}`, res.status)
    return res
  }

  async function request<T>(path: string, query: Query = {}, ms = timeoutMs): Promise<{ data: T; nextPage: number | null; serverTime: Date | null }> {
    const res = await send(path, query, "application/json", ms)
    const next = Number(res.headers.get("x-next-page"))
    const date = new Date(res.headers.get("date") ?? Number.NaN)
    return { data: (await res.json()) as T, nextPage: Number.isFinite(next) && next > 0 ? next : null, serverTime: Number.isNaN(date.getTime()) ? null : date }
  }

  /** Raw bytes, refused (without reading the rest) as soon as they exceed `maxBytes`. */
  async function download(path: string, query: Query, maxBytes: number): Promise<RawFileResult> {
    const res = await send(path, query, "*/*", DOWNLOAD_TIMEOUT_MS)
    if (Number(res.headers.get("content-length") ?? 0) > maxBytes) {
      await res.body?.cancel().catch(() => undefined)
      return { kind: "too_large" }
    }
    const reader = res.body?.getReader()
    if (!reader) return { kind: "ok", data: Buffer.alloc(0) }
    const parts: Uint8Array[] = []
    let total = 0
    for (let r = await reader.read(); !r.done; r = await reader.read()) {
      total += r.value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined)
        return { kind: "too_large" }
      }
      parts.push(r.value)
    }
    return { kind: "ok", data: Buffer.concat(parts) }
  }

  /**
   * Pages up to `maxPages`. `truncated` is true when GitLab still had another
   * page: the caller must not treat the listing as complete (e.g. must not move
   * a sync watermark past it).
   */
  async function paged<T>(path: string, query: Query, maxPages: number, ms = timeoutMs): Promise<Paged<T>> {
    const items: T[] = []
    let page: number | null = 1
    let pages = 0
    while (pages < maxPages && page) {
      const r: { data: T[]; nextPage: number | null } = await request<T[]>(path, { ...query, per_page: PER_PAGE, page }, ms)
      items.push(...r.data)
      page = r.nextPage
      pages++
    }
    return { items, truncated: page !== null, pages }
  }

  /** For listings whose callers take the first pages as a bounded sample. */
  const itemsOf = <T>(p: Promise<Paged<T>>): Promise<T[]> => p.then((r) => r.items)

  const project = (id: number | string) => `/projects/${encodeURIComponent(String(id))}`

  return {
    getProject: async (pathOrId: string | number) => (await request<GitLabProject>(project(pathOrId))).data,
    /**
     * One page of merge requests updated on or after `updatedAfter` (GitLab: "on or after"),
     * ascending by updated_at. Single pages so the sync can re-anchor every request at the
     * last updated_at it saw (keyset by filter) instead of trusting offsets across pages.
     */
    listMergeRequestPage: async (id: number, { updatedAfter, page = 1, perPage = PER_PAGE }: MergeRequestPageQuery): Promise<MergeRequestPage> => {
      const r = await request<GitLabMergeRequest[]>(`${project(id)}/merge_requests`, {
        scope: "all",
        state: "all",
        order_by: "updated_at",
        sort: "asc",
        updated_after: updatedAfter.toISOString(),
        per_page: Math.min(PER_PAGE, Math.max(1, Math.floor(perPage))),
        page: Math.max(1, Math.floor(page)),
      })
      return { items: r.data, hasMore: r.nextPage !== null, serverTime: r.serverTime }
    },
    getMergeRequestPipeline: async (id: number, iid: number): Promise<string | null> => {
      const mr = (await request<{ head_pipeline?: { status?: string } | null }>(`${project(id)}/merge_requests/${iid}`)).data
      return mr.head_pipeline?.status ?? null
    },
    /**
     * Changed files of a merge request (W4 scope check), up to maxPages × 100 files. GitLab
     * 15.7+ pages them (`/diffs`); an older GitLab answers 404 there and the one-shot
     * `/changes` (capped by GitLab's own diff limits, `overflow`) is read instead. Both answers
     * carry the diff text too (GitLab has no paths-only listing), hence the longer timeout.
     */
    listMergeRequestChangedFiles: async (id: number, iid: number, maxPages = 3): Promise<Paged<GitLabDiffEntry>> => {
      const base = `${project(id)}/merge_requests/${iid}`
      try {
        return await paged<GitLabDiffEntry>(`${base}/diffs`, {}, maxPages, DOWNLOAD_TIMEOUT_MS)
      } catch (err) {
        if (!(err instanceof GitLabError) || err.kind !== "not_found") throw err
        const r = (await request<{ changes?: GitLabDiffEntry[]; overflow?: boolean }>(`${base}/changes`, {}, DOWNLOAD_TIMEOUT_MS)).data
        return { items: r.changes ?? [], truncated: r.overflow === true, pages: 1 }
      }
    },
    listTags: (id: number, maxPages = 3) => itemsOf(paged<GitLabTag>(`${project(id)}/repository/tags`, { order_by: "updated", sort: "desc" }, maxPages)),
    listReleases: (id: number, maxPages = 3) => itemsOf(paged<GitLabRelease>(`${project(id)}/releases`, { order_by: "released_at", sort: "desc" }, maxPages)),
    /** True when the token can read the repository contents (a Guest on a private project cannot). */
    canReadRepository: async (id: number): Promise<boolean> => {
      try {
        await request<unknown[]>(`${project(id)}/repository/branches`, { per_page: 1 })
        return true
      } catch (err) {
        if (err instanceof GitLabError && err.kind === "forbidden") return false
        throw err
      }
    },
    /** Branches whose name contains `search`; `truncated` = more than maxPages × 100, so the caller must not prune by it. */
    listBranches: (id: number, search: string, maxPages = 3): Promise<Paged<GitLabBranch>> => paged<GitLabBranch>(`${project(id)}/repository/branches`, { search }, maxPages),
    /**
     * Commits of every branch committed in [since, until] (until omitted = up to now).
     * Newest first; with all=true the order is not strictly by date, so only an
     * untruncated listing proves its whole window was read.
     */
    listCommits: (id: number, since: Date, until?: Date, maxPages = 3): Promise<Paged<GitLabCommit>> =>
      paged<GitLabCommit>(`${project(id)}/repository/commits`, { since: since.toISOString(), until: until?.toISOString(), all: true }, maxPages),
    /** Newest commit id of the default branch, or null for an empty repository. */
    latestCommitSha: async (id: number): Promise<string | null> => {
      const r = await request<Array<{ id: string }>>(`${project(id)}/repository/commits`, { per_page: 1 })
      return r.data[0]?.id ?? null
    },
    /** Every entry of the tree at `ref`, recursively (up to maxPages × 100 entries). */
    listTree: (id: number, ref: string, maxPages: number) =>
      itemsOf(paged<GitLabTreeEntry>(`${project(id)}/repository/tree`, { ref, recursive: true }, maxPages)),
    compare: async (id: number, from: string, to: string): Promise<GitLabCompare> =>
      (await request<GitLabCompare>(`${project(id)}/repository/compare`, { from, to }, DOWNLOAD_TIMEOUT_MS)).data,
    /** Raw content of one file at `ref` (the path is encoded as one segment, as GitLab requires). */
    rawFile: (id: number, filePath: string, ref: string, maxBytes: number) =>
      download(`${project(id)}/repository/files/${encodeURIComponent(filePath)}/raw`, { ref }, maxBytes),
  }
}

export type GitLabClient = ReturnType<typeof createGitLabClient>
