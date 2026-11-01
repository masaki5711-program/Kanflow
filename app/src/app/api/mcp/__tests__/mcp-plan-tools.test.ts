import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * MCP plan tools (W12): get_plan (read) and propose_plan_items (backlog:write; PO / SM). The proposal tool never
 * writes to the plan: it only opens one approval card in a chat thread of the token owner.
 */

const m = vi.hoisted(() => ({
  memberFindFirst: vi.fn(),
  projectFindFirst: vi.fn(),
  projectSectionFindFirst: vi.fn(),
  loadUserAuthState: vi.fn(),
  createThread: vi.fn(),
  insertMessage: vi.fn(),
  insertPlanItem: vi.fn(),
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
  it("offers get_plan and propose_plan_items with the data notice; no tool writes plan items directly", async () => {
    const all = (await rpc("tools/list", {})).result.tools as Array<{ name: string; description: string }>
    const tools = all.filter((t) => ["get_plan", "propose_plan_items"].includes(t.name))
    expect(tools).toHaveLength(2)
    for (const t of tools) expect(t.description).toContain(DATA_NOTICE)
    expect(tools.find((t) => t.name === "propose_plan_items")?.description).toMatch(/does NOT change the plan/)
    expect(all.some((t) => /^(create|update|delete)_plan/.test(t.name))).toBe(false)
  })
})

describe("get_plan", () => {
  it("returns the plan as a tree with dates and dependencies", async () => {
    const row = (id: string, parentId: string | null, name: string, extra = {}) => ({ id, parentId, name, status: "not_started", progressPct: 0, isMilestone: false, plannedStart: day("2026-11-02"), plannedEnd: day("2026-11-06"), durationDays: 5, owner: null, ...extra })
    vi.mocked(planRepo.findPlanItems).mockResolvedValue([row("a", null, "仕様"), row("b", "a", "要求"), row("c", null, "検収", { isMilestone: true, plannedStart: null, plannedEnd: null })] as never)
    vi.mocked(planRepo.findDependencies).mockResolvedValue([{ id: "d1", predecessorId: "a", successorId: "c" }] as never)
    const r = await callTool("get_plan", { projectId: "p1" })
    expect(r.isError).toBeUndefined()
    expect(r.payload.itemCount).toBe(3)
    expect(r.payload.data).toHaveLength(2)
    expect(r.payload.data[0]).toMatchObject({ id: "a", plannedStart: "2026-11-02", dependsOn: [], children: [{ id: "b", name: "要求" }] })
    expect(r.payload.data[1]).toMatchObject({ id: "c", isMilestone: true, plannedStart: null, dependsOn: ["a"] })
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
})
