import { describe, expect, it, vi } from "vitest"
import { createGitStationClient } from "@/lib/git/gitstation-client"

/** The X3 binding calls of the GitStation client: headers, methods, single sends, shape checks. Synthetic data only. */
const BASE = "https://gitstation.example"
const ASSERTION = `fga_${"0".repeat(16)}_${"s".repeat(64)}`
const AS = { userId: 41, assertion: ASSERTION }

function client(answer: (url: URL, init: RequestInit) => Response) {
  const calls: { url: URL; init: RequestInit }[] = []
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    calls.push({ url, init: init ?? {} })
    return answer(url, init ?? {})
  }) as unknown as typeof fetch
  const c = createGitStationClient({ apiBase: BASE, token: "fgp_t", integrationId: "7", fetchImpl, sleep: async () => undefined, allowedHosts: ["gitstation.example"] })
  return { c, calls }
}
const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } })
const bindingBody = (over: Record<string, unknown> = {}) => ({
  binding_id: 100,
  integration_id: 7,
  kanflow_project_id: "kf-1",
  repository_id: 31,
  repository_path: "app/portal",
  settings: { resolves_work_items: true },
  granted_membership: true,
  created_by: null,
  created_at: "2026-11-10T00:00:00Z",
  ...over,
})
const header = (init: RequestInit, name: string) => new Headers(init.headers).get(name)

describe("GitStation client: repository bindings (X3)", () => {
  it("searches as the person (GET, Forge-Act-As employee:<n>, no assertion), once — a 429 is not retried", async () => {
    const { c, calls } = client((url) =>
      url.searchParams.get("q") === "busy" ? json(429, { error_code: "FG-WEB-0010" }, { "retry-after": "1" }) : json(200, { items: [{ id: 31, path: "app/portal", display_name: "Portal" }, { id: "x" }] }),
    )
    expect(await c.searchRepositoriesAs(" portal ", "E1")).toEqual([{ id: 31, path: "app/portal", displayName: "Portal" }])
    expect([calls[0].url.pathname, calls[0].url.searchParams.get("q"), calls[0].url.searchParams.get("limit"), calls[0].init.method]).toEqual(["/api/v1/repositories", "portal", "20", "GET"])
    expect([header(calls[0].init, "forge-act-as"), header(calls[0].init, "forge-assertion")]).toEqual(["employee:E1", null])
    await expect(c.searchRepositoriesAs("busy", "E1")).rejects.toMatchObject({ kind: "rate_limited" })
    expect(calls).toHaveLength(2)
  })

  it("never sends a search it cannot name the person for, or an empty / over-long text", async () => {
    const { c, calls } = client(() => json(200, { items: [] }))
    await expect(c.searchRepositoriesAs("a", "E 1")).rejects.toMatchObject({ kind: "act_as_target_invalid" })
    await expect(c.searchRepositoriesAs("  ", "E1")).rejects.toMatchObject({ kind: "invalid_response" })
    await expect(c.searchRepositoriesAs("a".repeat(101), "E1")).rejects.toMatchObject({ kind: "invalid_response" })
    expect(calls).toHaveLength(0)
  })

  it("lists this Kanflow project's bindings as the service account (no Forge-Act-As), dropping anything else", async () => {
    const { c, calls } = client(() => json(200, { items: [bindingBody(), bindingBody({ binding_id: 101, kanflow_project_id: "other" }), { binding_id: 102 }] }))
    expect(await c.repositoryBindings("kf-1")).toEqual([{ bindingId: 100, repositoryId: 31, repositoryPath: "app/portal", kanflowProjectId: "kf-1", resolvesWorkItems: true }])
    expect([calls[0].url.pathname, calls[0].url.searchParams.get("kanflow_project_id"), header(calls[0].init, "forge-act-as")]).toEqual(["/api/v1/integrations/7/bindings", "kf-1", null])
  })

  it("binds with POST, changes with PATCH, both as user:<id> with the assertion", async () => {
    const { c, calls } = client((_u, init) => json(200, { outcome: init.method === "PATCH" ? "updated" : "bound", binding: bindingBody({ settings: { resolves_work_items: init.method === "PATCH" } }) }))
    expect(await c.setBindingAs({ kanflowProjectId: "kf-1", repositoryId: 31, resolvesWorkItems: false, bindingId: null }, AS)).toMatchObject({ outcome: "bound", binding: { resolvesWorkItems: false } })
    expect(await c.setBindingAs({ kanflowProjectId: "kf-1", repositoryId: 31, resolvesWorkItems: true, bindingId: 100 }, AS)).toMatchObject({ outcome: "updated", binding: { resolvesWorkItems: true } })
    expect(calls.map((k) => [k.init.method, k.url.pathname, k.init.body, header(k.init, "forge-act-as"), header(k.init, "forge-assertion")])).toEqual([
      ["POST", "/api/v1/integrations/7/bindings", JSON.stringify({ kanflow_project_id: "kf-1", repository_id: 31, settings: { resolves_work_items: false } }), "user:41", ASSERTION],
      ["PATCH", "/api/v1/integrations/7/bindings/100", JSON.stringify({ settings: { resolves_work_items: true } }), "user:41", ASSERTION],
    ])
  })

  it("unbinds with DELETE (204) as user:<id> with the assertion, sent once", async () => {
    const { c, calls } = client((_u, init) => (init.method === "DELETE" && calls.length === 1 ? new Response(null, { status: 204 }) : json(503, { error_code: "FG-DB-0012" })))
    await c.removeBindingAs(100, AS)
    await expect(c.removeBindingAs(100, AS)).rejects.toMatchObject({ kind: "unavailable" })
    expect(calls.map((k) => [k.init.method, k.url.pathname, header(k.init, "forge-act-as"), header(k.init, "forge-assertion")])).toEqual([
      ["DELETE", "/api/v1/integrations/7/bindings/100", "user:41", ASSERTION],
      ["DELETE", "/api/v1/integrations/7/bindings/100", "user:41", ASSERTION],
    ])
  })

  it("refuses an answer of an unexpected shape, and requests Kanflow could not send safely", async () => {
    const { c, calls } = client(() => json(200, { outcome: "bound", binding: { binding_id: 1 } }))
    await expect(c.setBindingAs({ kanflowProjectId: "kf-1", repositoryId: 31, resolvesWorkItems: true, bindingId: null }, AS)).rejects.toMatchObject({ kind: "invalid_response" })
    await expect(c.setBindingAs({ kanflowProjectId: "kf/1", repositoryId: 31, resolvesWorkItems: true, bindingId: null }, AS)).rejects.toMatchObject({ kind: "invalid_response" })
    await expect(c.repositoryBindings("kf 1")).rejects.toMatchObject({ kind: "invalid_response" })
    expect(calls).toHaveLength(1)
  })

  it("parses a binding claim (no merge request, the Kanflow project and the setting)", async () => {
    const { c } = client(() => json(200, { assertion: ASSERTION, sub: { user_id: 41, employee_number: "E1" }, intent: "binding_set", project_id: 31, iid: null, head_sha: null, target_ref: null, kanflow_project_id: "kf-1", resolves_work_items: false, expires_at: "2026-11-10T00:05:00Z" }))
    expect(await c.claimActAs("s".repeat(43))).toMatchObject({ intent: "binding_set", projectId: 31, iid: null, headSha: null, targetRef: null, kanflowProjectId: "kf-1", resolvesWorkItems: false })
  })
})
