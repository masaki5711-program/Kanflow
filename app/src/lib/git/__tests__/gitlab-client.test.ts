import { describe, expect, it, vi } from "vitest"
import { createGitLabClient, GitLabError, accessLevelOf } from "../gitlab-client"

const API_BASE = "https://gitlab.scm.service.infosys.yamaha.com"
const TOKEN = "glpat-test-token"

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } })
}

describe("createGitLabClient — request plumbing", () => {
  it("sends the PRIVATE-TOKEN header and Accept: application/json", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ id: 1, web_url: "u", path_with_namespace: "g/r", default_branch: "main" }))
    const client = createGitLabClient({ apiBase: API_BASE, token: TOKEN, fetchImpl })
    await client.getProject("g/r")
    const [, init] = fetchImpl.mock.calls[0]
    expect((init!.headers as Record<string, string>)["PRIVATE-TOKEN"]).toBe(TOKEN)
    expect((init!.headers as Record<string, string>).Accept).toBe("application/json")
    expect(init!.cache).toBe("no-store")
  })

  it("builds the URL from apiBase + /api/v4 + path, URL-encoding the project id", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ id: 1, web_url: "u", path_with_namespace: "g/r", default_branch: null }))
    const client = createGitLabClient({ apiBase: API_BASE, token: TOKEN, fetchImpl })
    await client.getProject("group/sub repo")
    const [url] = fetchImpl.mock.calls[0]
    expect(String(url)).toBe(`${API_BASE}/api/v4/projects/group%2Fsub%20repo`)
  })

  it("accepts a numeric project id", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ id: 42, web_url: "u", path_with_namespace: "g/r", default_branch: null }))
    const client = createGitLabClient({ apiBase: API_BASE, token: TOKEN, fetchImpl })
    await client.getProject(42)
    expect(String(fetchImpl.mock.calls[0][0])).toBe(`${API_BASE}/api/v4/projects/42`)
  })

  it("passes an AbortSignal honoring the configured timeout", async () => {
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      return jsonResponse({ id: 1, web_url: "u", path_with_namespace: "g/r", default_branch: null })
    })
    const client = createGitLabClient({ apiBase: API_BASE, token: TOKEN, fetchImpl, timeoutMs: 5_000 })
    await client.getProject("g/r")
    expect(fetchImpl).toHaveBeenCalled()
  })
})

describe("createGitLabClient — error mapping", () => {
  it.each([
    [401, "auth"],
    [403, "forbidden"],
    [404, "not_found"],
    [429, "rate_limited"],
    [500, "http"],
    [502, "http"],
  ] as const)("maps HTTP %s to kind %s", async (status, kind) => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("", { status }))
    const client = createGitLabClient({ apiBase: API_BASE, token: TOKEN, fetchImpl })
    await expect(client.getProject("g/r")).rejects.toMatchObject({ kind, status })
  })

  it("maps a network-level fetch rejection to kind 'network' without leaking the raw error", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed: ECONNREFUSED")
    })
    const client = createGitLabClient({ apiBase: API_BASE, token: TOKEN, fetchImpl })
    const err = await client.getProject("g/r").catch((e) => e)
    expect(err).toBeInstanceOf(GitLabError)
    expect(err.kind).toBe("network")
    expect(err.message).toContain("GitLab unreachable")
  })

  it("maps an abort (timeout) to kind 'network' too", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new DOMException("The operation was aborted", "AbortError")
    })
    const client = createGitLabClient({ apiBase: API_BASE, token: TOKEN, fetchImpl })
    await expect(client.getProject("g/r")).rejects.toMatchObject({ kind: "network" })
  })

  it("GitLabError carries name 'GitLabError' and the original status for http errors", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("", { status: 503 }))
    const client = createGitLabClient({ apiBase: API_BASE, token: TOKEN, fetchImpl })
    const err: GitLabError = await client.getProject("g/r").catch((e) => e)
    expect(err.name).toBe("GitLabError")
    expect(err.status).toBe(503)
  })
})

describe("createGitLabClient — pagination", () => {
  it("follows x-next-page across pages and stops when it is absent", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([{ iid: 1 }], 200, { "x-next-page": "2" }))
      .mockResolvedValueOnce(jsonResponse([{ iid: 2 }], 200, {}))
    const client = createGitLabClient({ apiBase: API_BASE, token: TOKEN, fetchImpl })
    const result = await client.listBranches(1, "pbi")
    expect(result).toEqual([{ iid: 1 }, { iid: 2 }])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it("stops at maxPages even when the server reports more pages (picked up by the next sync)", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse([{ iid: 1 }], 200, { "x-next-page": "99" }))
    const client = createGitLabClient({ apiBase: API_BASE, token: TOKEN, fetchImpl })
    const result = await client.listBranches(1, "pbi", 3)
    expect(result).toHaveLength(3)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it("treats a non-numeric or zero x-next-page as 'no more pages'", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse([{ iid: 1 }], 200, { "x-next-page": "not-a-number" }))
    const client = createGitLabClient({ apiBase: API_BASE, token: TOKEN, fetchImpl })
    await client.listBranches(1, "pbi")
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it("sends per_page=100 and the page number on each request", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse([]))
    const client = createGitLabClient({ apiBase: API_BASE, token: TOKEN, fetchImpl })
    await client.listBranches(7, "pbi")
    const url = new URL(String(fetchImpl.mock.calls[0][0]))
    expect(url.searchParams.get("per_page")).toBe("100")
    expect(url.searchParams.get("page")).toBe("1")
    expect(url.searchParams.get("search")).toBe("pbi")
  })
})

describe("createGitLabClient — endpoint query shapes", () => {
  it("listMergeRequests requests scope=all, state=all, sort=asc by updated_at, and updated_after", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse([]))
    const client = createGitLabClient({ apiBase: API_BASE, token: TOKEN, fetchImpl })
    const since = new Date("2026-01-01T00:00:00.000Z")
    await client.listMergeRequests(5, since)
    const url = new URL(String(fetchImpl.mock.calls[0][0]))
    expect(url.pathname).toBe("/api/v4/projects/5/merge_requests")
    expect(url.searchParams.get("scope")).toBe("all")
    expect(url.searchParams.get("state")).toBe("all")
    expect(url.searchParams.get("order_by")).toBe("updated_at")
    expect(url.searchParams.get("sort")).toBe("asc")
    expect(url.searchParams.get("updated_after")).toBe(since.toISOString())
  })

  it("listCommits requests since (ISO) and all=true", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse([]))
    const client = createGitLabClient({ apiBase: API_BASE, token: TOKEN, fetchImpl })
    const since = new Date("2026-02-02T00:00:00.000Z")
    await client.listCommits(5, since)
    const url = new URL(String(fetchImpl.mock.calls[0][0]))
    expect(url.pathname).toBe("/api/v4/projects/5/repository/commits")
    expect(url.searchParams.get("since")).toBe(since.toISOString())
    expect(url.searchParams.get("all")).toBe("true")
  })

  it("getMergeRequestPipeline reads head_pipeline.status", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ head_pipeline: { status: "success" } }))
    const client = createGitLabClient({ apiBase: API_BASE, token: TOKEN, fetchImpl })
    const status = await client.getMergeRequestPipeline(5, 12)
    expect(status).toBe("success")
    const url = new URL(String(fetchImpl.mock.calls[0][0]))
    expect(url.pathname).toBe("/api/v4/projects/5/merge_requests/12")
  })

  it("getMergeRequestPipeline returns null when there is no pipeline yet", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({}))
    const client = createGitLabClient({ apiBase: API_BASE, token: TOKEN, fetchImpl })
    expect(await client.getMergeRequestPipeline(5, 12)).toBeNull()
  })

  it("getMergeRequestPipeline returns null when head_pipeline is explicitly null", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ head_pipeline: null }))
    const client = createGitLabClient({ apiBase: API_BASE, token: TOKEN, fetchImpl })
    expect(await client.getMergeRequestPipeline(5, 12)).toBeNull()
  })
})

describe("canReadRepository", () => {
  const fetchWith = (status: number) =>
    vi.fn<typeof fetch>().mockResolvedValue(new Response(status === 200 ? "[]" : "{}", { status, headers: { "content-type": "application/json" } }))

  it("is true when the branch list is readable and false on 403 (e.g. a Guest)", async () => {
    expect(await createGitLabClient({ apiBase: "https://gl.example", token: "t", fetchImpl: fetchWith(200) }).canReadRepository(1)).toBe(true)
    expect(await createGitLabClient({ apiBase: "https://gl.example", token: "t", fetchImpl: fetchWith(403) }).canReadRepository(1)).toBe(false)
  })

  it("rethrows other failures", async () => {
    await expect(createGitLabClient({ apiBase: "https://gl.example", token: "t", fetchImpl: fetchWith(401) }).canReadRepository(1)).rejects.toMatchObject({ kind: "auth" })
  })
})

describe("accessLevelOf", () => {
  it("takes the highest of project and group access, null when unknown", () => {
    expect(accessLevelOf({ permissions: { project_access: { access_level: 30 }, group_access: { access_level: 10 } } })).toBe(30)
    expect(accessLevelOf({ permissions: { project_access: null, group_access: { access_level: 10 } } })).toBe(10)
    expect(accessLevelOf({ permissions: null })).toBeNull()
  })
})

describe("createGitLabClient — knowledge index endpoints", () => {
  const client = (fetchImpl: typeof fetch) => createGitLabClient({ apiBase: API_BASE, token: TOKEN, fetchImpl })

  it("latestCommitSha asks for one commit of the default branch (null for an empty repository)", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse([{ id: "abc" }]))
    expect(await client(fetchImpl).latestCommitSha(7)).toBe("abc")
    expect(String(fetchImpl.mock.calls[0][0])).toBe(`${API_BASE}/api/v4/projects/7/repository/commits?per_page=1`)
    expect(await client(vi.fn<typeof fetch>(async () => jsonResponse([]))).latestCommitSha(7)).toBeNull()
  })

  it("listTree pages through the recursive tree at a commit", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse([{ id: "1", path: "a.md", type: "blob" }], 200, { "x-next-page": "2" }))
      .mockResolvedValueOnce(jsonResponse([{ id: "2", path: "b.md", type: "blob" }]))
    const tree = await client(fetchImpl).listTree(7, "sha1", 5)
    expect(tree.map((e) => e.path)).toEqual(["a.md", "b.md"])
    const url = new URL(String(fetchImpl.mock.calls[0][0]))
    expect(url.pathname).toBe("/api/v4/projects/7/repository/tree")
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ ref: "sha1", recursive: "true", per_page: "100", page: "1" })
  })

  it("compare passes from / to", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ diffs: [], compare_timeout: false }))
    expect(await client(fetchImpl).compare(7, "old", "new")).toEqual({ diffs: [], compare_timeout: false })
    expect(String(fetchImpl.mock.calls[0][0])).toBe(`${API_BASE}/api/v4/projects/7/repository/compare?from=old&to=new`)
  })

  it("rawFile encodes the path as one segment and returns the bytes", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("# 仕様", { status: 200 }))
    const r = await client(fetchImpl).rawFile(7, "10-pfs/06 oee.md", "sha1", 1000)
    expect(r.kind === "ok" && r.data.toString("utf8")).toBe("# 仕様")
    expect(String(fetchImpl.mock.calls[0][0])).toBe(`${API_BASE}/api/v4/projects/7/repository/files/10-pfs%2F06%20oee.md/raw?ref=sha1`)
  })

  it("rawFile refuses a file over the limit, by Content-Length or while streaming", async () => {
    const declared = vi.fn<typeof fetch>(async () => new Response("x".repeat(10), { status: 200, headers: { "content-length": "5000" } }))
    expect(await client(declared).rawFile(7, "big.pdf", "s", 100)).toEqual({ kind: "too_large" })
    const streamed = vi.fn<typeof fetch>(async () => new Response("y".repeat(500), { status: 200 }))
    expect(await client(streamed).rawFile(7, "big.txt", "s", 100)).toEqual({ kind: "too_large" })
  })

  it("maps errors of the new endpoints like every other call", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("", { status: 404 }))
    await expect(client(fetchImpl).rawFile(7, "gone.md", "s", 100)).rejects.toMatchObject({ kind: "not_found" })
    await expect(client(fetchImpl).compare(7, "a", "b")).rejects.toBeInstanceOf(GitLabError)
  })
})
