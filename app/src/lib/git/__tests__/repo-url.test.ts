import { describe, expect, it } from "vitest"
import { allowedHosts, DEFAULT_GIT_ALLOWED_HOSTS, parseRepoUrl } from "../repo-url"

const HOST = "gitlab.scm.service.infosys.yamaha.com"
const HOSTS = [HOST] as const
/** Partial env objects are enough for this pure function; NodeJS.ProcessEnv's typing requires NODE_ENV. */
const fakeEnv = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv

describe("allowedHosts", () => {
  it("defaults to the company GitLab host when GIT_ALLOWED_HOSTS is unset", () => {
    expect(allowedHosts(fakeEnv({}))).toEqual([DEFAULT_GIT_ALLOWED_HOSTS])
  })

  it("splits, trims, lowercases and drops empty entries", () => {
    expect(allowedHosts(fakeEnv({ GIT_ALLOWED_HOSTS: "a.com, B.COM ,,c.com" }))).toEqual(["a.com", "b.com", "c.com"])
  })
})

describe("parseRepoUrl — accepted forms", () => {
  it("parses a plain https group/sub/repo URL", () => {
    expect(parseRepoUrl(`https://${HOST}/group/sub/repo`, HOSTS)).toEqual({
      apiBase: `https://${HOST}`,
      repoPath: "group/sub/repo",
      webUrl: `https://${HOST}/group/sub/repo`,
    })
  })

  it("strips a trailing .git", () => {
    expect(parseRepoUrl(`https://${HOST}/group/sub/repo.git`, HOSTS)?.repoPath).toBe("group/sub/repo")
  })

  it("drops everything after /-/ (GitLab's tree/blob/merge_requests suffix)", () => {
    const loc = parseRepoUrl(`https://${HOST}/group/sub/repo/-/tree/main/sub/dir`, HOSTS)
    expect(loc?.repoPath).toBe("group/sub/repo")
  })

  it("accepts the git@host:path.git SSH form and normalizes it to https", () => {
    expect(parseRepoUrl(`git@${HOST}:group/sub/repo.git`, HOSTS)).toEqual({
      apiBase: `https://${HOST}`,
      repoPath: "group/sub/repo",
      webUrl: `https://${HOST}/group/sub/repo`,
    })
  })

  it("is case-insensitive on the host", () => {
    expect(parseRepoUrl(`https://${HOST.toUpperCase()}/Group/Repo`, HOSTS)).toEqual({
      apiBase: `https://${HOST}`,
      repoPath: "Group/Repo",
      webUrl: `https://${HOST}/Group/Repo`,
    })
  })

  it("ignores a query string or fragment", () => {
    expect(parseRepoUrl(`https://${HOST}/group/repo?x=1`, HOSTS)?.repoPath).toBe("group/repo")
    expect(parseRepoUrl(`https://${HOST}/group/repo#frag`, HOSTS)?.repoPath).toBe("group/repo")
  })

  it("trims surrounding whitespace", () => {
    expect(parseRepoUrl(`  https://${HOST}/group/repo  `, HOSTS)?.repoPath).toBe("group/repo")
  })
})

describe("parseRepoUrl — SSRF guard (host allowlist) and rejected forms", () => {
  it("rejects a URL on a host outside the allowlist", () => {
    expect(parseRepoUrl("https://evil.example/group/repo", HOSTS)).toBeNull()
  })

  it("rejects plain http (no TLS)", () => {
    expect(parseRepoUrl(`http://${HOST}/group/repo`, HOSTS)).toBeNull()
  })

  it("rejects embedded credentials (user:pass@host)", () => {
    expect(parseRepoUrl(`https://user:pass@${HOST}/group/repo`, HOSTS)).toBeNull()
  })

  it("rejects an explicit port", () => {
    expect(parseRepoUrl(`https://${HOST}:8080/group/repo`, HOSTS)).toBeNull()
  })

  it("rejects a userinfo trick that tries to smuggle the allowed host as a username", () => {
    expect(parseRepoUrl(`https://${HOST}@evil.com/group/repo`, HOSTS)).toBeNull()
  })

  it("rejects a trailing-dot FQDN that is not literally in the allowlist", () => {
    expect(parseRepoUrl(`https://${HOST}./group/repo`, HOSTS)).toBeNull()
  })

  it("rejects a bare host with no repo path (fewer than 2 segments)", () => {
    expect(parseRepoUrl(`https://${HOST}/group`, HOSTS)).toBeNull()
    expect(parseRepoUrl(`https://${HOST}/`, HOSTS)).toBeNull()
    expect(parseRepoUrl(`https://${HOST}`, HOSTS)).toBeNull()
  })

  it("rejects doubled slashes that would produce an empty path segment", () => {
    expect(parseRepoUrl(`https://${HOST}//group//repo//`, HOSTS)).toBeNull()
  })

  it("rejects a mid-path '..' that normalizes away to a single segment", () => {
    // URL parsing resolves dot-segments before this function ever sees them;
    // "/group/../repo" becomes "/repo", which then fails the >=2 segments rule.
    expect(parseRepoUrl(`https://${HOST}/group/../repo`, HOSTS)).toBeNull()
  })

  it("rejects a percent-encoded '..' the same way as a literal one", () => {
    expect(parseRepoUrl(`https://${HOST}/%2e%2e/evil`, HOSTS)).toBeNull()
  })

  it("rejects an ssh form from a user other than 'git'", () => {
    expect(parseRepoUrl(`someone@${HOST}:group/repo.git`, HOSTS)).toBeNull()
  })

  it("rejects malformed input, empty string, and whitespace-only input", () => {
    expect(parseRepoUrl("not a url", HOSTS)).toBeNull()
    expect(parseRepoUrl("", HOSTS)).toBeNull()
    expect(parseRepoUrl("   ", HOSTS)).toBeNull()
  })

  it("rejects input over 1000 characters", () => {
    expect(parseRepoUrl(`https://${HOST}/` + "a".repeat(1000), HOSTS)).toBeNull()
  })

  it("rejects a path segment with a disallowed character", () => {
    expect(parseRepoUrl(`https://${HOST}/group/repo name`, HOSTS)).toBeNull()
  })
})
