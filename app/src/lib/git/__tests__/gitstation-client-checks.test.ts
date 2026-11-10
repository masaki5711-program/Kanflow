import { describe, expect, it, vi } from "vitest"
import { createGitStationClient } from "@/lib/git/gitstation-client"

/** Check runs (GitStation docs/api/checks.md): POST /projects/{id}/commits/{sha}/checks. Synthetic data only. */
const BASE = "https://gitstation.example"
const SHA = "a".repeat(40)
const CHECK = { name: "kanflow/acceptance", conclusion: "success" as const, summary: "受入の準備ができています。\n確認した PBI: PBI-1" }

function client(answer: (url: URL, init: RequestInit) => Response) {
  const calls: { url: URL; init: RequestInit }[] = []
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    calls.push({ url, init: init ?? {} })
    return answer(url, init ?? {})
  }) as unknown as typeof fetch
  const sleep = vi.fn(async () => undefined)
  return { calls, sleep, api: createGitStationClient({ apiBase: BASE, token: "fgp_t", integrationId: "7", fetchImpl, sleep, allowedHosts: ["gitstation.example"] }) }
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } })
const header = (init: RequestInit, name: string) => new Headers(init.headers).get(name)

describe("GitStation client: reportCheck", () => {
  it("writes a completed check run on the commit with the service account token", async () => {
    const { api, calls } = client(() => json(201, { id: 1 }))
    await api.reportCheck(12, SHA, CHECK)
    expect(calls).toHaveLength(1)
    expect(calls[0].url.pathname).toBe(`/api/v1/projects/12/commits/${SHA}/checks`)
    expect(calls[0].url.search).toBe("")
    expect(calls[0].init.method).toBe("POST")
    expect(header(calls[0].init, "authorization")).toBe("Bearer fgp_t")
    expect(header(calls[0].init, "content-type")).toBe("application/json")
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ name: "kanflow/acceptance", status: "completed", conclusion: "success", summary: CHECK.summary })
  })

  it("sends nothing but the four fields (no details_url, no annotations)", async () => {
    const { api, calls } = client(() => json(201, { id: 1 }))
    await api.reportCheck(12, SHA, { ...CHECK, conclusion: "action_required", details_url: "https://kanflow.example/x", annotations: [{}] } as never)
    expect(Object.keys(JSON.parse(calls[0].init.body as string)).sort()).toEqual(["conclusion", "name", "status", "summary"])
  })

  it("takes both answers: 201 (new) and 200 (the same commit and name again)", async () => {
    for (const status of [201, 200]) {
      const { api } = client(() => json(status, { id: 1 }))
      await expect(api.reportCheck(12, SHA, CHECK)).resolves.toBeUndefined()
    }
  })

  it("accepts a SHA-256 commit id", async () => {
    const { api, calls } = client(() => json(201, {}))
    await api.reportCheck(12, "b".repeat(64), CHECK)
    expect(calls[0].url.pathname).toBe(`/api/v1/projects/12/commits/${"b".repeat(64)}/checks`)
  })

  it("refuses anything that is not a full lower-case commit id, without a request", async () => {
    const { api, calls } = client(() => json(201, {}))
    for (const bad of ["abc1234", "A".repeat(40), "a".repeat(41), `${"a".repeat(39)}/`, "../../admin", ""]) {
      await expect(api.reportCheck(12, bad, CHECK)).rejects.toMatchObject({ kind: "invalid_response" })
    }
    expect(calls).toHaveLength(0)
  })

  it("a refusal (403) and a commit the project cannot reach (404) carry GitStation's error code", async () => {
    const refused = client(() => json(403, { error_code: "FG-AUTH-0003", user_message: "x", request_id: "r" }))
    await expect(refused.api.reportCheck(12, SHA, CHECK)).rejects.toMatchObject({ kind: "forbidden", detail: { errorCode: "FG-AUTH-0003" } })
    const missing = client(() => json(404, { error_code: "FG-REPO-0023", user_message: "x", request_id: "r" }))
    await expect(missing.api.reportCheck(12, SHA, CHECK)).rejects.toMatchObject({ kind: "not_found", detail: { errorCode: "FG-REPO-0023" } })
    expect(refused.calls).toHaveLength(1)
    expect(missing.calls).toHaveLength(1)
  })

  it("is never sent twice: a busy GitStation (429 / 503) fails the report, the next tick tries again", async () => {
    for (const [status, kind] of [
      [503, "unavailable"],
      [429, "rate_limited"],
    ] as const) {
      const { api, calls, sleep } = client(() => json(status, {}, { "retry-after": "1" }))
      await expect(api.reportCheck(12, SHA, CHECK)).rejects.toMatchObject({ kind })
      expect(calls).toHaveLength(1)
      expect(sleep).not.toHaveBeenCalled()
    }
  })
})
