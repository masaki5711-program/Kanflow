/**
 * Repository URL parsing and the host allowlist (pure).
 *
 * Accepted: https://host/group/sub/repo, …/repo.git, …/repo/-/tree/main
 * (anything after "/-/" is dropped) and the SSH form git@host:group/repo.git.
 * Only hosts in GIT_ALLOWED_HOSTS (comma separated; default: the company
 * GitLab) are accepted, so the server never calls an arbitrary URL with a
 * stored token (SSRF).
 */
export const DEFAULT_GIT_ALLOWED_HOSTS = "gitlab.scm.service.infosys.yamaha.com"

export interface RepoLocation {
  /** https://host */
  apiBase: string
  /** group/sub/repo */
  repoPath: string
  /** https://host/group/sub/repo */
  webUrl: string
}

export function allowedHosts(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.GIT_ALLOWED_HOSTS ?? DEFAULT_GIT_ALLOWED_HOSTS)
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
}

/** Repository location, or null for anything that is not a repository URL on an allowed host. */
export function parseRepoUrl(input: string, hosts: readonly string[] = allowedHosts()): RepoLocation | null {
  const raw = input.trim()
  if (!raw || raw.length > 1000) return null
  const ssh = /^git@([^:/\s]+):(.+)$/.exec(raw)
  let url: URL
  try {
    url = new URL(ssh ? `https://${ssh[1]}/${ssh[2]}` : raw)
  } catch {
    return null
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null
  const host = url.hostname.toLowerCase()
  if (!hosts.includes(host)) return null
  const path = decodeURIComponent(url.pathname)
    .split("/-/")[0]
    .replace(/\.git$/i, "")
    .replace(/^\/+|\/+$/g, "")
  const segments = path.split("/")
  if (segments.length < 2 || segments.some((s) => !/^[A-Za-z0-9_.][A-Za-z0-9_.-]*$/.test(s))) return null
  return { apiBase: `https://${host}`, repoPath: segments.join("/"), webUrl: `https://${host}/${segments.join("/")}` }
}

export interface MergeRequestLocation extends RepoLocation {
  /** The merge request number inside its repository (GitLab iid). */
  iid: number
  /** https://host/group/repo/-/merge_requests/<iid> (canonical: no sub-page, query or fragment). */
  url: string
}

const MAX_IID = 2_147_483_647

/**
 * A merge request URL (https://host/group/sub/repo/-/merge_requests/12, optionally
 * followed by a sub-page such as /diffs, a query or a fragment) on an allowed host,
 * or null. Used for links a developer declares (write:dev): only the repository
 * and the number are kept, the URL is rebuilt, so nothing else of the input is stored.
 */
export function parseMergeRequestUrl(input: string, hosts: readonly string[] = allowedHosts()): MergeRequestLocation | null {
  const raw = input.trim()
  if (!raw || raw.length > 1000) return null
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  const match = /^(.+?)\/-\/merge_requests\/(\d{1,10})(?:\/[A-Za-z0-9_./-]*)?$/.exec(url.pathname)
  if (!match || match[1].includes("/-/")) return null
  const iid = Number(match[2])
  if (!Number.isSafeInteger(iid) || iid < 1 || iid > MAX_IID) return null
  const repo = parseRepoUrl(`${url.protocol}//${url.host}${match[1]}`, hosts)
  if (!repo || url.username || url.password) return null
  return { ...repo, iid, url: `${repo.webUrl}/-/merge_requests/${iid}` }
}
