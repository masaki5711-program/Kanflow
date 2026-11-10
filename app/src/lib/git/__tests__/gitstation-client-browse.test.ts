import { describe, expect, it, vi } from "vitest"
import { createGitStationClient, MAX_RESPONSE_BYTES } from "@/lib/git/gitstation-client"

/** Repository browse reads (N12): GET /projects/{id}/repository/{refs|tree|blob|compare}. Synthetic data only. */
const BASE = "https://gitstation.example"

function client(answer: (url: URL) => Response) {
  const calls: { url: URL; init: RequestInit }[] = []
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    calls.push({ url, init: init ?? {} })
    return answer(url)
  }) as unknown as typeof fetch
  const sleep = vi.fn(async () => undefined)
  return { calls, sleep, api: createGitStationClient({ apiBase: BASE, token: "fgp_t", integrationId: "7", fetchImpl, sleep, allowedHosts: ["gitstation.example"] }) }
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } })

describe("GitStation client: repositoryGet", () => {
  it("reads one browse route with the service account token, never following a redirect", async () => {
    const { api, calls } = client(() => json(200, { entries: [] }))
    expect(await api.repositoryGet(12, "tree", { ref: "refs/heads/main", path: "docs/a b" })).toEqual({ entries: [] })
    expect(calls[0].url.pathname).toBe("/api/v1/projects/12/repository/tree")
    expect([...calls[0].url.searchParams]).toEqual([
      ["ref", "refs/heads/main"],
      ["path", "docs/a b"],
    ])
    expect(new Headers(calls[0].init.headers).get("authorization")).toBe("Bearer fgp_t")
    expect(calls[0].init.redirect).toBe("error")
    expect(calls[0].init.method).toBe("GET")
  })

  it("does not send a query value that is undefined (GitStation refuses unknown and empty parameters)", async () => {
    const { api, calls } = client(() => json(200, {}))
    await api.repositoryGet(12, "tree", { ref: "refs/heads/main", path: undefined })
    expect([...calls[0].url.searchParams.keys()]).toEqual(["ref"])
  })

  it("refuses a project id that is not one before sending anything", async () => {
    const { api, calls } = client(() => json(200, {}))
    await expect(api.repositoryGet(-1, "refs", { type: "branch" })).rejects.toMatchObject({ kind: "invalid_response" })
    expect(calls).toEqual([])
  })

  it("retries a 503 and keeps the error code of a 403", async () => {
    let n = 0
    const { api } = client(() => (n++ === 0 ? json(503, { error_code: "FG-GIT-0004" }, { "retry-after": "1" }) : json(200, { ok: true })))
    expect(await api.repositoryGet(12, "refs", { type: "branch" })).toEqual({ ok: true })

    const refused = client(() => json(403, { error_code: "FG-AUTH-0021", user_message: "x", request_id: "r" }))
    await expect(refused.api.repositoryGet(12, "blob", { ref: "refs/heads/main", path: "docs/secret.md" })).rejects.toMatchObject({ kind: "forbidden", status: 403, detail: { errorCode: "FG-AUTH-0021" } })
  })

  it("marks an answer over the size cap as too large (declared, and streamed)", async () => {
    const declared = client(() => new Response("{}", { status: 200, headers: { "content-length": String(MAX_RESPONSE_BYTES + 1) } }))
    await expect(declared.api.repositoryGet(12, "blob", { ref: "r", path: "p" })).rejects.toMatchObject({ kind: "invalid_response", detail: { reason: "response_too_large" } })
    const streamed = client(() => new Response(`"${"x".repeat(MAX_RESPONSE_BYTES + 10)}"`, { status: 200 }))
    await expect(streamed.api.repositoryGet(12, "blob", { ref: "r", path: "p" })).rejects.toMatchObject({ kind: "invalid_response", detail: { reason: "response_too_large" } })
  })
})
