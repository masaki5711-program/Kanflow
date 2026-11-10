import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * MCP plan tools (W12): get_plan (read) and propose_plan_items (backlog:write; PO / SM). The proposal tool never
 * writes to the plan: it only opens one approval card in a chat thread of the token owner.
 * The tools that do change single rows (scope plan:write) are tested in mcp-plan-write-tools.test.ts.
 */

const m = vi.hoisted(() => ({
  memberFindFirst: vi.fn(),
  projectFindFirst: vi.fn(),
  projectSectionFindFirst: vi.fn(),
  loadUserAuthState: vi.fn(),
  createThread: vi.fn(),
  insertMessage: vi.fn(),
  insertPlanItem: vi.fn(),
  createRun: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectMember: { findFirst: m.memberFindFirst },
    project: { findFirst: m.projectFindFirst },
    projectSection: { findFirst: m.projectSectionFindFirst },
  },
}))
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}))
vi.mock("@/lib/authz/session-validity", async (orig) => ({
  ...(await orig<typeof import("@/lib/authz/session-validity")>()),
  loadUserAuthState: m.loadUserAuthState,
}))
vi.mock("@/services/api-tokens/api-tokens.repository")
vi.mock("@/services/api-v1/api-v1.service")
vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/services/plan/plan.repository", () => ({
  findPlanItems: vi.fn(),
  findDependencies: vi.fn(),
  findProjectName: vi.fn(async () => "設備導入 A"),
  insertPlanItem: m.insertPlanItem,
}))
vi.mock("@/services/plan-estimate-run/estimate-run.service", () => ({ createRun: m.createRun, REMOVED_OWNER_KEYS_MAX: 500 }))
vi.mock("@/services/chat-threads/chat-threads.repository", () => ({ createThread: m.createThread, insertMessage: m.insertMessage }))

const repo = await import("@/services/api-tokens/api-tokens.repository")
const v1 = await import("@/services/api-v1/api-v1.service")
const planRepo = await import("@/services/plan/plan.repository")
const { generateApiToken } = await import("@/lib/api-tokens/token")
const { resetApiTokenTouchCache } = await import("@/services/api-tokens/api-token-auth")
const { resetIdempotencyStore } = await import("@/app/api/v1/_lib/v1-write")
const { DATA_NOTICE } = await import("@/app/api/mcp/_lib/tool-kit")
const mcpRoute = await import("@/app/api/mcp/route")

const token = generateApiToken()
const day = (s: string) => new Date(`${s}T00:00:00.000Z`)

let rpcId = 0
async function rpc(method: string, params: unknown) {
  const res = await mcpRoute.POST(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { authorization: `Bearer ${token.token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
    }),
  )
  expect(res.status).toBe(200)
  return (await res.json()) as { result: Record<string, unknown> }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>
async function callTool(name: string, args: Record<string, unknown>) {
  const msg = await rpc("tools/call", { name, arguments: args })
  const result = msg.result as { isError?: boolean; content: Array<{ text: string }> }
  const text = result.content[0].text
  return { isError: result.isError, payload: (text.startsWith("{") ? JSON.parse(text) : { text }) as Json }
}
const withScopes = (scopes: string) =>
  vi.mocked(repo.findTokenByHash).mockResolvedValue({
    id: "t1", userId: "u1", prefix: token.prefix, scopes, projectIds: null, userTokenVersion: 0, expiresAt: null, revokedAt: null, lastUsedAt: null,
  } as never)

const SCHEDULE = {
  startDate: "2026-11-02",
  items: [
    { key: "spec", name: "仕様", children: [{ key: "req", name: "要求", durationDays: 5 }, { key: "rfq", name: "見積", durationDays: 3, dependsOn: ["req"] }] },
    { key: "accept", name: "検収", durationDays: 1, milestone: true, dependsOn: ["rfq"] },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  delete (globalThis as { __kanflowRateLimiters?: unknown }).__kanflowRateLimiters
  resetApiTokenTouchCache()
  resetIdempotencyStore()
  withScopes('["read","backlog:write"]')
  vi.mocked(repo.touchLastUsed).mockResolvedValue({ count: 1 })
  m.loadUserAuthState.mockResolvedValue({ isActive: true, role: "member", tokenVersion: 0 })
  m.projectFindFirst.mockResolvedValue({ id: "p1" })
  m.projectSectionFindFirst.mockResolvedValue(null)
  m.memberFindFirst.mockResolvedValue({ role: "po" })
  vi.mocked(v1.loadApiActor).mockResolvedValue({ userId: "u1", userName: "PO One", systemRole: "member", via: "api" })
  m.createThread.mockResolvedValue({ id: "th1" })
  m.insertMessage.mockResolvedValue({ id: "msg1" })
})

describe("tool list", () => {
  it("offers get_plan and propose_plan_items with the data notice; the proposal says it does not change the plan", async () => {
    const all = (await rpc("tools/list", {})).result.tools as Array<{ name: string; description: string }>
    const tools = all.filter((t) => ["get_plan", "propose_plan_items"].includes(t.name))
    expect(tools).toHaveLength(2)
    for (const t of tools) expect(t.description).toContain(DATA_NOTICE)
    expect(tools.find((t) => t.name === "propose_plan_items")?.description).toMatch(/does NOT change the plan/)
  })

  // The tools that write plan rows are a closed list, each behind plan:write (mcp-plan-write-tools.test.ts);
  // a new one must be added here on purpose. Nothing deletes a plan row over MCP.
  it("only create_plan_item, update_plan_item and set_plan_dependencies change the plan directly, and none deletes", async () => {
    const all = (await rpc("tools/list", {})).result.tools as Array<{ name: string; description: string }>
    const direct = all.filter((t) => /plan/.test(t.name) && !/^(get_plan|propose_plan_)/.test(t.name))
    expect(direct.map((t) => t.name).sort()).toEqual(["create_plan_item", "set_plan_dependencies", "update_plan_item"])
    for (const t of direct) expect(t.description).toMatch(/scope plan:write/)
    expect(all.some((t) => /(delete|remove|trash)/.test(t.name))).toBe(false)
  })
})

describe("get_plan", () => {
  it("returns the plan as a tree with dates and dependencies", async () => {
    const row = (id: string, parentId: string | null, name: string, extra = {}) => ({ id, parentId, name, status: "not_started", progressPct: 0, isMilestone: false, plannedStart: day("2026-11-02"), plannedEnd: day("2026-11-06"), actualStart: null, actualEnd: null, progressMode: "manual", durationDays: 5, owner: null, version: 0, ...extra })
    vi.mocked(planRepo.findPlanItems).mockResolvedValue([row("a", null, "仕様", { actualStart: day("2026-11-03"), version: 4 }), row("b", "a", "要求"), row("c", null, "検収", { isMilestone: true, plannedStart: null, plannedEnd: null })] as never)
    vi.mocked(planRepo.findDependencies).mockResolvedValue([{ id: "d1", predecessorId: "a", successorId: "c" }] as never)
    const r = await callTool("get_plan", { projectId: "p1" })
    expect(r.isError).toBeUndefined()
    expect(r.payload.itemCount).toBe(3)
    expect(r.payload.data).toHaveLength(2)
    expect(r.payload.data[0]).toMatchObject({ id: "a", plannedStart: "2026-11-02", dependsOn: [], children: [{ id: "b", name: "要求" }] })
    // The lock token and the actual dates travel with every node (update_plan_item sends the version back).
    expect(r.payload.data[0]).toMatchObject({ version: 4, actualStart: "2026-11-03", actualEnd: null, children: [{ version: 0, actualStart: null }] })
    expect(r.payload.data[1]).toMatchObject({ id: "c", isMilestone: true, plannedStart: null, dependsOn: ["a"] })
    expect(JSON.stringify(r.payload)).not.toContain("progressMode")
  })
  it("answers no actual dates for a row whose progress follows its linked PBIs: they may come from a confidential PBI", async () => {
    const row = (id: string, progressMode: string) => ({ id, parentId: null, name: id, status: "done", progressPct: 100, isMilestone: false, plannedStart: day("2026-11-02"), plannedEnd: day("2026-11-06"), actualStart: day("2026-11-03"), actualEnd: day("2026-11-09"), progressMode, durationDays: 5, owner: null, version: 1 })
    vi.mocked(planRepo.findPlanItems).mockResolvedValue([row("hand", "manual"), row("linked", "linked"), row("unknown", "something-new")] as never)
    vi.mocked(planRepo.findDependencies).mockResolvedValue([])
    const r = await callTool("get_plan", { projectId: "p1" })
    expect(r.payload.data[0]).toMatchObject({ id: "hand", actualStart: "2026-11-03", actualEnd: "2026-11-09" })
    // Planned dates, status and percentage stay (the documented residual signal); the actual dates do not leave.
    expect(r.payload.data[1]).toMatchObject({ id: "linked", status: "done", progressPct: 100, plannedEnd: "2026-11-06", actualStart: null, actualEnd: null })
    expect(r.payload.data[2]).toMatchObject({ id: "unknown", actualStart: null, actualEnd: null })
    // The finish date appears once in the whole answer: for the hand-kept row.
    expect(JSON.stringify(r.payload).split("2026-11-09")).toHaveLength(2)
  })
  it("a non-member gets NOT_FOUND", async () => {
    m.memberFindFirst.mockResolvedValue(null)
    expect(await callTool("get_plan", { projectId: "p1" })).toEqual({ isError: true, payload: { error: "Not found", code: "NOT_FOUND" } })
  })
})

describe("propose_plan_items", () => {
  it("creates ONE plan_load proposal in a thread of the token owner and writes nothing to the plan", async () => {
    const r = await callTool("propose_plan_items", { projectId: "p1", name: "設備導入", reason: "ベースから", ...SCHEDULE })
    expect(r.isError).toBeUndefined()
    expect(r.payload.data).toMatchObject({ threadId: "th1", itemCount: 4, dependencyCount: 2, plannedStart: "2026-11-02", plannedEnd: "2026-11-10", chatPath: "/projects/p1/chat?thread=th1" })
    expect(m.createThread).toHaveBeenCalledWith(expect.anything(), { projectId: "p1", userId: "u1" }, expect.stringContaining("設備導入"))
    const events = JSON.parse(m.insertMessage.mock.calls[0][1].toolEvents)
    expect(events).toHaveLength(1)
    expect(events[0].proposal).toMatchObject({ kind: "plan_load", startDate: "2026-11-02", itemCount: 4, schedule: { items: SCHEDULE.items } })
    expect(events[0].proposal.preview.map((p: { name: string }) => p.name)).toEqual(["仕様", "検収"])
    expect(m.insertPlanItem).not.toHaveBeenCalled()
    expect(events[0].proposal.preview[0]).toMatchObject({ name: "仕様", children: 2, childNames: ["要求", "見積"] })
  })

  it("the card preview lists at most 5 child names per root and counts the rest", async () => {
    const kids = Array.from({ length: 8 }, (_, i) => ({ key: `c${i}`, name: `c${i}`, durationDays: 1 }))
    await callTool("propose_plan_items", { projectId: "p1", startDate: "2026-11-02", items: [{ key: "r", name: "R", children: kids }] })
    const preview = JSON.parse(m.insertMessage.mock.calls[0][1].toolEvents)[0].proposal.preview[0]
    expect(preview.childNames).toHaveLength(5)
    expect(preview.children).toBe(8)
  })

  it("needs backlog:write; a read-only token is INSUFFICIENT_SCOPE", async () => {
    withScopes('["read"]')
    const r = await callTool("propose_plan_items", { projectId: "p1", ...SCHEDULE })
    expect(r.payload).toMatchObject({ code: "INSUFFICIENT_SCOPE", requiredScope: "backlog:write" })
    expect(m.createThread).not.toHaveBeenCalled()
  })

  it("a developer (not PO / SM) is refused even with backlog:write", async () => {
    m.memberFindFirst.mockResolvedValue({ role: "dev" })
    const r = await callTool("propose_plan_items", { projectId: "p1", ...SCHEDULE })
    expect(r.isError).toBe(true)
    expect(r.payload.code).toBe("FORBIDDEN")
    expect(m.createThread).not.toHaveBeenCalled()
  })

  it.each([
    ["a dependency cycle", { items: [{ key: "a", name: "a", dependsOn: ["b"] }, { key: "b", name: "b", dependsOn: ["a"] }] }, "PLAN_SCHEDULE_INVALID"],
    ["an unknown dependency", { items: [{ key: "a", name: "a", dependsOn: ["zz"] }] }, "PLAN_SCHEDULE_INVALID"],
    ["a duplicate key", { items: [{ key: "a", name: "a" }, { key: "a", name: "b" }] }, "PLAN_SCHEDULE_INVALID"],
    ["6 levels", { items: [{ key: "l1", name: "x", children: [{ key: "l2", name: "x", children: [{ key: "l3", name: "x", children: [{ key: "l4", name: "x", children: [{ key: "l5", name: "x", children: [{ key: "l6", name: "x" }] }] }] }] }] }] }, "PLAN_SCHEDULE_TOO_DEEP"],
  ])("%s is refused with %s and nothing is stored", async (_label, schedule, code) => {
    const r = await callTool("propose_plan_items", { projectId: "p1", startDate: "2026-11-02", ...schedule })
    expect(r.isError).toBe(true)
    expect(r.payload.code).toBe(code)
    expect(m.createThread).not.toHaveBeenCalled()
  })

  it("more than 500 items is refused before Kanflow runs (input validation)", async () => {
    const items = Array.from({ length: 501 }, (_, i) => ({ key: `k${i}`, name: "x", durationDays: 1 }))
    const r = await callTool("propose_plan_items", { projectId: "p1", startDate: "2026-11-02", items })
    expect(r.isError).toBe(true)
    expect(JSON.stringify(r.payload)).toMatch(/Input validation error|PLAN_SCHEDULE_TOO_LARGE|500/)
    expect(m.createThread).not.toHaveBeenCalled()
  })

  it("500 items in total (nested, short names) fit in one card; one that is too large for the thread is PLAN_PROPOSAL_TOO_LARGE", async () => {
    const ok = Array.from({ length: 500 }, (_, i) => ({ key: `k${i}`, name: `n${i}`, durationDays: 1 }))
    expect((await callTool("propose_plan_items", { projectId: "p1", startDate: "2026-11-02", items: ok })).isError).toBeUndefined()
    const fat = Array.from({ length: 300 }, (_, i) => ({ key: `k${i}`, name: "あ".repeat(250), durationDays: 1 }))
    const r = await callTool("propose_plan_items", { projectId: "p1", startDate: "2026-11-02", items: fat })
    expect(r.payload.code).toBe("PLAN_PROPOSAL_TOO_LARGE")
  })

  // plan 12 E0: where the schedule came from travels with the proposal to the approval.
  it("carries sourceRef and the lineage (derived from it when absent) in the proposal", async () => {
    await callTool("propose_plan_items", { projectId: "p1", ...SCHEDULE, sourceRef: "gitstation:equipment-spec@v1.2.0:schedule.yml" })
    const proposal = JSON.parse(m.insertMessage.mock.calls[0][1].toolEvents)[0].proposal
    expect(proposal).toMatchObject({ sourceRef: "gitstation:equipment-spec@v1.2.0:schedule.yml", lineage: "gitstation:equipment-spec:schedule.yml" })
  })

  it("an explicit lineage is kept; without a source the card's own name (not the default heading) names the lineage", async () => {
    await callTool("propose_plan_items", { projectId: "p1", ...SCHEDULE, lineage: "設備導入の標準工程" })
    await callTool("propose_plan_items", { projectId: "p1", ...SCHEDULE, name: "設備導入" })
    await callTool("propose_plan_items", { projectId: "p1", ...SCHEDULE })
    const [a, b, c] = m.insertMessage.mock.calls.map((call) => JSON.parse(call[1].toolEvents)[0].proposal)
    expect(a.lineage).toBe("設備導入の標準工程")
    expect(b.lineage).toBe("name:設備導入")
    expect(c.lineage).toBeUndefined() // decided by the load from the content hash
    expect(a.proposalId).not.toBe(c.proposalId) // a different lineage is a different proposal
  })

  it("old schedules keep their proposal id (no sourceRef / lineage → same digest as before E0)", async () => {
    await callTool("propose_plan_items", { projectId: "p1", ...SCHEDULE })
    const proposal = JSON.parse(m.insertMessage.mock.calls[0][1].toolEvents)[0].proposal
    const { createHash } = await import("node:crypto")
    const { startDate, ...schedule } = SCHEDULE
    expect(proposal.proposalId).toBe(`prop_plan_${createHash("sha256").update(JSON.stringify({ s: startDate, p: schedule })).digest("hex").slice(0, 16)}`)
  })

  it("the digest covers the lineage: same schedule with different card names (= lineages) are different proposals", async () => {
    await callTool("propose_plan_items", { projectId: "p1", ...SCHEDULE, name: "設備導入" })
    await callTool("propose_plan_items", { projectId: "p1", ...SCHEDULE, name: "工程改善" })
    await callTool("propose_plan_items", { projectId: "p1", ...SCHEDULE, name: "  設備導入 " })
    const [a, b, c] = m.insertMessage.mock.calls.map((call) => JSON.parse(call[1].toolEvents)[0].proposal)
    expect(a.proposalId).not.toBe(b.proposalId)
    expect(a.proposalId).toBe(c.proposalId) // the same lineage after normalization
  })

  it("an explicit lineage that disagrees with its sourceRef is kept but warned about (answer and card text)", async () => {
    const r = await callTool("propose_plan_items", { projectId: "p1", ...SCHEDULE, sourceRef: "template:clx0abc123@v4", lineage: "template:other" })
    expect(r.isError).toBeUndefined()
    expect(r.payload.data.warnings).toEqual([expect.stringContaining('implied by sourceRef')])
    expect(JSON.parse(m.insertMessage.mock.calls[0][1].toolEvents)[0].proposal.lineage).toBe("template:other")
    expect(m.insertMessage.mock.calls[0][1].content).toMatch(/注意: 系統/)
    m.insertMessage.mockClear()
    const agree = await callTool("propose_plan_items", { projectId: "p1", ...SCHEDULE, sourceRef: "template:clx0abc123@v4", lineage: "template:clx0abc123" })
    expect(agree.payload.data.warnings).toBeUndefined()
    expect(m.insertMessage.mock.calls[0][1].content).not.toMatch(/注意/)
  })

  it("a malformed sourceRef is refused and nothing is stored", async () => {
    const r = await callTool("propose_plan_items", { projectId: "p1", ...SCHEDULE, sourceRef: "http://example.test/schedule.yml" })
    expect(r.isError).toBe(true)
    expect(m.createThread).not.toHaveBeenCalled()
  })
})

describe("propose_plan_from_actuals (plan 12 E5)", () => {
  const RUN = {
    runId: "r1",
    expiresAt: "2026-11-05T00:00:00.000Z",
    summary: { methodVersion: "e2-v1", gateOn: true, gateReason: null, templateEnd: "2026-11-10", p50End: "2026-11-12", p80End: "2026-11-14", bufferDays: 2, plannedEnd: "2026-11-13", leafCount: 3, rulesApplied: 0, rulesRejected: 0, matchedProjects: "4-9", changes: [{ key: "req", name: "要求", templateDays: 5, days: 7 }], changesTotal: 37 },
  }

  it("mcp_response_has_no_per_person_load: only the run id, end dates, counts and the web link", async () => {
    m.createRun.mockResolvedValue(RUN)
    const r = await callTool("propose_plan_from_actuals", { projectId: "p1", ...SCHEDULE, roleAssignments: { dev: ["u2"] } })
    expect(r.isError).toBeFalsy()
    expect(Object.keys(r.payload)).toEqual(["data"])
    expect(Object.keys(r.payload.data).sort()).toEqual(["expiresAt", "runId", "summary", "webPath"])
    expect(r.payload.data.webPath).toBe("/projects/p1/plan/estimate?run=r1")
    expect(Object.keys(r.payload.data.summary).sort()).toEqual(["bufferDays", "changedItemCount", "gateOn", "gateReason", "itemCount", "p50End", "p80End", "plannedEnd", "templateEnd"])
    // No item names and no person: nothing beyond dates and counts leaves through MCP.
    // The count is the total, not the length of the card's capped list.
    expect(r.payload.data.summary.changedItemCount).toBe(37)
    expect(JSON.stringify(r.payload)).not.toContain("要求")
    expect(JSON.stringify(r.payload)).not.toContain("u2")
    expect(m.createRun).toHaveBeenCalledWith("p1", expect.objectContaining({ startDate: "2026-11-02", roleAssignments: { dev: ["u2"] } }), expect.objectContaining({ userId: "u1" }))
    expect(m.insertPlanItem).not.toHaveBeenCalled()
  })

  it("mcp_requires_plan_estimate: backlog:write scope AND the person's plan.estimate", async () => {
    withScopes('["read"]')
    expect((await callTool("propose_plan_from_actuals", { projectId: "p1", ...SCHEDULE })).payload).toMatchObject({ code: "INSUFFICIENT_SCOPE", requiredScope: "backlog:write" })
    withScopes('["read","backlog:write"]')
    m.memberFindFirst.mockResolvedValue({ role: "dev" })
    const r = await callTool("propose_plan_from_actuals", { projectId: "p1", ...SCHEDULE })
    expect(r.isError).toBe(true)
    expect(r.payload.code).toBe("FORBIDDEN")
    expect(m.createRun).not.toHaveBeenCalled()
  })

  it("a section manager who only sees the project, and a non-member, are refused", async () => {
    m.memberFindFirst.mockResolvedValue(null)
    m.loadUserAuthState.mockResolvedValue({ isActive: true, role: "section_manager", tokenVersion: 0 })
    m.projectSectionFindFirst.mockResolvedValue({ projectId: "p1" })
    const asManager = await callTool("propose_plan_from_actuals", { projectId: "p1", ...SCHEDULE })
    expect(asManager.isError).toBe(true)
    expect(asManager.payload.code).toBe("FORBIDDEN")
    m.loadUserAuthState.mockResolvedValue({ isActive: true, role: "member", tokenVersion: 0 })
    m.projectSectionFindFirst.mockResolvedValue(null)
    const outsider = await callTool("propose_plan_from_actuals", { projectId: "p1", ...SCHEDULE })
    expect(outsider.isError).toBe(true)
    expect(outsider.payload.code).toBe("NOT_FOUND")
    expect(m.createRun).not.toHaveBeenCalled()
  })

  it("needs exactly one of templateId and items", async () => {
    const r = await callTool("propose_plan_from_actuals", { projectId: "p1", startDate: "2026-11-02" })
    expect(r.isError).toBe(true)
    expect(m.createRun).not.toHaveBeenCalled()
  })
})
