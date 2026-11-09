import { describe, expect, it, vi } from "vitest"
import { createGitStationClient, GitStationError } from "@/lib/git/gitstation-client"

/** The act-as calls of the GitStation client (plan 11 K4): headers, single sends, shape checks. Synthetic data only. */
const BASE = "https://gitstation.example"
const SHA = "a".repeat(40)

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
const claimBody = { assertion: `fga_${"0".repeat(16)}_${"s".repeat(64)}`, sub: { user_id: 41, employee_number: "E1" }, intent: "approve", project_id: 12, iid: 3, head_sha: SHA, target_ref: "refs/heads/main", kanflow_project_id: null, resolves_work_items: null, expires_at: "2026-11-09T00:05:00Z" }

describe("GitStation client: act-as", () => {
  it("reads the status as the person (Forge-Act-As: employee:<n>, GET, no assertion)", async () => {
    const { c, calls } = client(() => json(200, { iid: 3, head_sha: SHA, reasons: [], viewer: { approved_by_me: true, act_as: { can_approve: { allowed: false, reason: "self_approval" }, can_unapprove: { allowed: true, reason: null }, requires_assertion: true } } }))
    const s = await c.mergeRequestStatusAs(12, 3, "E-1.a_b")
    expect(s).toEqual({ iid: 3, headSha: SHA, open: true, approvedByMe: true, actAs: { canApprove: { allowed: false, reason: "self_approval" }, canUnapprove: { allowed: true, reason: null } } })
    const h = new Headers(calls[0].init.headers)
    expect(calls[0].url.pathname).toBe("/api/v1/projects/12/merge-requests/3/status")
    expect([calls[0].init.method, h.get("forge-act-as"), h.get("forge-assertion"), calls[0].init.redirect]).toEqual(["GET", "employee:E-1.a_b", null, "error"])
  })

  it("never names a person whose employee number GitStation's grammar refuses (nothing is sent)", async () => {
    const { c, calls } = client(() => json(200, {}))
    await expect(c.mergeRequestStatusAs(12, 3, "E 1,user:2")).rejects.toMatchObject({ kind: "act_as_target_invalid" })
    expect(calls).toHaveLength(0)
  })

  it("offers nothing when GitStation's answer has no act_as part", async () => {
    const { c } = client(() => json(200, { iid: 3, head_sha: SHA, reasons: [{ reason: "not_open", detail: null }], viewer: { approved_by_me: false } }))
    expect(await c.mergeRequestStatusAs(12, 3, "E1")).toMatchObject({ open: false, actAs: null })
  })

  it("claims with the state only (POST, no Forge-Act-As) and parses the answer", async () => {
    const { c, calls } = client(() => json(200, claimBody))
    expect(await c.claimActAs("s".repeat(43))).toMatchObject({ sub: { userId: 41, employeeNumber: "E1" }, projectId: 12, iid: 3, headSha: SHA })
    const h = new Headers(calls[0].init.headers)
    expect([calls[0].url.pathname, calls[0].init.method, h.get("forge-act-as"), calls[0].init.body]).toEqual(["/api/v1/integrations/7/act-as/claim", "POST", null, JSON.stringify({ state: "s".repeat(43) })])
  })

  it("refuses a claim of an unexpected shape (no usable assertion)", async () => {
    const { c } = client(() => json(200, { ...claimBody, assertion: "not-an-assertion" }))
    await expect(c.claimActAs("s".repeat(43))).rejects.toMatchObject({ kind: "invalid_response" })
  })

  it("sends a write once: a 429 / 503 on a claim or an approval is not retried", async () => {
    const { c, calls } = client(() => json(429, { error_code: "FG-WEB-0010" }, { "retry-after": "1" }))
    await expect(c.claimActAs("s".repeat(43))).rejects.toBeInstanceOf(GitStationError)
    await expect(c.approveAs(12, 3, "approve", { userId: 41, assertion: claimBody.assertion, sha: SHA })).rejects.toMatchObject({ kind: "rate_limited" })
    expect(calls).toHaveLength(2)
  })

  it("approves with Forge-Act-As user:<id>, the assertion and the sha", async () => {
    const { c, calls } = client(() => json(200, { iid: 3, outcome: "approved", counted: true, uncounted_reason: null, approval: null }))
    expect(await c.approveAs(12, 3, "approve", { userId: 41, assertion: claimBody.assertion, sha: SHA })).toEqual({ outcome: "approved", counted: true })
    const h = new Headers(calls[0].init.headers)
    expect([calls[0].url.pathname, h.get("forge-act-as"), h.get("forge-assertion"), calls[0].init.body]).toEqual(["/api/v1/projects/12/merge-requests/3/approve", "user:41", claimBody.assertion, JSON.stringify({ sha: SHA })])
  })

  it("keeps GitStation's error code on a refusal (the screen explains it)", async () => {
    const { c } = client(() => json(403, { error_code: "FG-REVIEW-0013", user_message: "x", request_id: "r" }))
    await expect(c.approveAs(12, 3, "approve", { userId: 41, assertion: claimBody.assertion, sha: SHA })).rejects.toMatchObject({ status: 403, detail: { errorCode: "FG-REVIEW-0013" } })
  })
})
