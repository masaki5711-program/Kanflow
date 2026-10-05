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
