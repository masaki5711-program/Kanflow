/**
 * Minimal GitLab REST v4 client for the read-only polling sync (read_api scope).
 * Every call has a timeout and bounded pagination; errors are mapped to
 * GitLabError kinds the settings UI can explain.
 */
export type GitLabErrorKind = "auth" | "not_found" | "rate_limited" | "network" | "http"

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
}

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

const TIMEOUT_MS = 15_000
const PER_PAGE = 100

type FetchLike = typeof fetch

export interface GitLabClientOptions {
  apiBase: string
  token: string
  fetchImpl?: FetchLike
  timeoutMs?: number
}

export function createGitLabClient({ apiBase, token, fetchImpl = fetch, timeoutMs = TIMEOUT_MS }: GitLabClientOptions) {
  async function request<T>(path: string, query: Record<string, string | number | boolean | undefined> = {}): Promise<{ data: T; nextPage: number | null }> {
    const url = new URL(`${apiBase}/api/v4${path}`)
    for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, String(v))
    let res: Response
    try {
      res = await fetchImpl(url, {
        headers: { "PRIVATE-TOKEN": token, Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      })
    } catch (err) {
      throw new GitLabError("network", `GitLab unreachable: ${err instanceof Error ? err.message : String(err)}`)
    }
    if (res.status === 401 || res.status === 403) throw new GitLabError("auth", `GitLab rejected the token (${res.status})`, res.status)
    if (res.status === 404) throw new GitLabError("not_found", "Repository not found or not visible to this token", 404)
    if (res.status === 429) throw new GitLabError("rate_limited", "GitLab rate limit reached", 429)
    if (!res.ok) throw new GitLabError("http", `GitLab responded ${res.status}`, res.status)
    const next = Number(res.headers.get("x-next-page"))
    return { data: (await res.json()) as T, nextPage: Number.isFinite(next) && next > 0 ? next : null }
  }

  /** All pages up to `maxPages` (the rest is picked up by the next sync). */
  async function paged<T>(path: string, query: Record<string, string | number | boolean | undefined>, maxPages: number): Promise<T[]> {
    const out: T[] = []
    let page: number | null = 1
    for (let i = 0; i < maxPages && page; i++) {
      const r: { data: T[]; nextPage: number | null } = await request<T[]>(path, { ...query, per_page: PER_PAGE, page })
      out.push(...r.data)
      page = r.nextPage
    }
    return out
  }

  const project = (id: number | string) => `/projects/${encodeURIComponent(String(id))}`

  return {
    getProject: async (pathOrId: string | number) => (await request<GitLabProject>(project(pathOrId))).data,
    listMergeRequests: (id: number, updatedAfter: Date, maxPages = 5) =>
      paged<GitLabMergeRequest>(`${project(id)}/merge_requests`, { scope: "all", state: "all", order_by: "updated_at", sort: "asc", updated_after: updatedAfter.toISOString() }, maxPages),
    getMergeRequestPipeline: async (id: number, iid: number): Promise<string | null> => {
      const mr = (await request<{ head_pipeline?: { status?: string } | null }>(`${project(id)}/merge_requests/${iid}`)).data
      return mr.head_pipeline?.status ?? null
    },
    listBranches: (id: number, search: string, maxPages = 3) => paged<GitLabBranch>(`${project(id)}/repository/branches`, { search }, maxPages),
    listCommits: (id: number, since: Date, maxPages = 3) =>
      paged<GitLabCommit>(`${project(id)}/repository/commits`, { since: since.toISOString(), all: true }, maxPages),
  }
}

export type GitLabClient = ReturnType<typeof createGitLabClient>
