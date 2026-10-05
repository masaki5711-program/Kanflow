import { describe, expect, it, vi } from "vitest"
import { createGitLabClient, GitLabError } from "../gitlab-client"

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
    [403, "auth"],
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
