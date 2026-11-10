import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * MCP plan write tools (scope plan:write; PO / SM): create_plan_item, update_plan_item, set_plan_dependencies.
 * The services are mocked: this file tests the MCP layer (scope, role, membership, input shape, the compact answer,
 * what a version conflict gives away). The rules of the writes themselves are tested with the services
 * (plan.service.test.ts, plan.schedule.test.ts).
 */

const m = vi.hoisted(() => ({
  memberFindFirst: vi.fn(),
  projectFindFirst: vi.fn(),
  projectSectionFindFirst: vi.fn(),
  loadUserAuthState: vi.fn(),
  createPlanItem: vi.fn(),
  updatePlanItem: vi.fn(),
  setPredecessors: vi.fn(),
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
vi.mock("@/services/plan/plan.repository")
vi.mock("@/services/plan/plan.service", async (orig) => ({
  ...(await orig<typeof import("@/services/plan/plan.service")>()),
  createPlanItem: m.createPlanItem,
  updatePlanItem: m.updatePlanItem,
}))
vi.mock("@/services/plan/plan.schedule", async (orig) => ({
  ...(await orig<typeof import("@/services/plan/plan.schedule")>()),
  setPredecessors: m.setPredecessors,
}))
vi.mock("@/services/plan-estimate-run/estimate-run.service", () => ({ createRun: vi.fn(), REMOVED_OWNER_KEYS_MAX: 500 }))
vi.mock("@/services/chat-threads/chat-threads.repository", () => ({ createThread: vi.fn(), insertMessage: vi.fn() }))

const repo = await import("@/services/api-tokens/api-tokens.repository")
const v1 = await import("@/services/api-v1/api-v1.service")
const { generateApiToken } = await import("@/lib/api-tokens/token")
const { resetApiTokenTouchCache } = await import("@/services/api-tokens/api-token-auth")
const { resetIdempotencyStore } = await import("@/app/api/v1/_lib/v1-write")
const { ValidationError, VersionConflictError } = await import("@/services/_shared/errors")
const { CREATE_NOTE, DATA_NOTICE } = await import("@/app/api/mcp/_lib/tool-kit")
const { toPlanItemAnswer } = await import("@/app/api/mcp/_lib/plan-write-tools")
const mcpRoute = await import("@/app/api/mcp/route")

const token = generateApiToken()
const WRITE_TOOLS = ["create_plan_item", "update_plan_item", "set_plan_dependencies"] as const

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
  return { isError: result.isError, text, payload: (text.startsWith("{") ? JSON.parse(text) : { text }) as Json }
}
const withScopes = (scopes: string) =>
  vi.mocked(repo.findTokenByHash).mockResolvedValue({
    id: "t1", userId: "u1", prefix: token.prefix, scopes, projectIds: null, userTokenVersion: 0, expiresAt: null, revokedAt: null, lastUsedAt: null,
  } as never)

/** The UI's DTO of a plan row, with the parts that must not leave Kanflow over MCP (synthetic). */
const DTO = {
  id: "i1",
  projectId: "p1",
  parentId: null,
  name: "据付",
  description: "社内向けの説明",
  notes: "社内メモ",
  status: "in_progress",
  progressPct: 40,
  isMilestone: false,
  plannedStart: "2026-11-02",
  plannedEnd: "2026-11-06",
  baselineStart: null,
  baselineEnd: null,
  actualStart: "2026-11-03",
  actualEnd: null,
  progressMode: "manual",
  color: "#336699",
  durationDays: 5,
  sortOrder: 3,
  version: 7,
  owner: { id: "u2", name: "Member Two", email: "two@example.test" },
  linked: { pbiCount: 4, doneCount: 1, sprints: ["Sprint 12"] },
  i18n: { name: { ja: "据付", id: "Instalasi" } },
}
const ANSWER = {
  id: "i1", parentId: null, name: "据付", status: "in_progress", progressPct: 40, isMilestone: false,
  plannedStart: "2026-11-02", plannedEnd: "2026-11-06", actualStart: "2026-11-03", actualEnd: null, durationDays: 5,
  owner: { id: "u2", name: "Member Two" }, version: 7,
}
const MCP_ACTOR = expect.objectContaining({ userId: "u1", via: "mcp" })

/** A valid call of each tool (the arguments the refusal tests reuse). */
const CALLS: Record<(typeof WRITE_TOOLS)[number], Record<string, unknown>> = {
  create_plan_item: { projectId: "p1", name: "据付" },
  update_plan_item: { projectId: "p1", itemId: "i1", status: "done", version: 7 },
  set_plan_dependencies: { projectId: "p1", itemId: "i1", dependsOn: ["i0"] },
}
const noServiceCalled = () => {
  expect(m.createPlanItem).not.toHaveBeenCalled()
  expect(m.updatePlanItem).not.toHaveBeenCalled()
  expect(m.setPredecessors).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  delete (globalThis as { __kanflowRateLimiters?: unknown }).__kanflowRateLimiters
  resetApiTokenTouchCache()
  resetIdempotencyStore()
  withScopes('["read","plan:write"]')
  vi.mocked(repo.touchLastUsed).mockResolvedValue({ count: 1 })
  m.loadUserAuthState.mockResolvedValue({ isActive: true, role: "member", tokenVersion: 0 })
  m.projectFindFirst.mockResolvedValue({ id: "p1" })
  m.projectSectionFindFirst.mockResolvedValue(null)
  m.memberFindFirst.mockResolvedValue({ role: "po" })
  vi.mocked(v1.loadApiActor).mockResolvedValue({ userId: "u1", userName: "PO One", systemRole: "member", via: "api" })
  m.createPlanItem.mockResolvedValue(DTO)
  m.updatePlanItem.mockResolvedValue(DTO)
  m.setPredecessors.mockResolvedValue({ successorId: "i1", dependsOn: ["i0"], added: 1, removed: 0, removedIds: [] })
})

describe("tool list", () => {
  it("offers the three plan write tools with the data notice; none of them is a read or a destructive tool", async () => {
    const all = (await rpc("tools/list", {})).result.tools as Array<{ name: string; description: string; annotations: Json }>
    const tools = all.filter((t) => (WRITE_TOOLS as readonly string[]).includes(t.name))
    expect(tools.map((t) => t.name).sort()).toEqual([...WRITE_TOOLS].sort())
    for (const t of tools) {
      expect(t.description).toContain(DATA_NOTICE)
      expect(t.description).toMatch(/scope plan:write; Product Owner \/ Scrum Master/)
      expect(t.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, openWorldHint: false })
    }
    expect(tools.find((t) => t.name === "create_plan_item")?.description).toContain(CREATE_NOTE)
  })

  it("plan rows cannot be deleted over MCP", async () => {
    const all = (await rpc("tools/list", {})).result.tools as Array<{ name: string }>
    expect(all.some((t) => /delete|remove|trash/.test(t.name))).toBe(false)
  })
})

describe.each(WRITE_TOOLS)("%s: who may call it", (tool) => {
  it.each([
    ["a read-only token", '["read"]'],
    ["a token with backlog:write (the proposal scope)", '["read","backlog:write"]'],
    ["a developer token", '["read","backlog:write","task:write","comment:write","dev:write"]'],
  ])("%s is INSUFFICIENT_SCOPE and names plan:write", async (_label, scopes) => {
    withScopes(scopes)
    const r = await callTool(tool, CALLS[tool])
    expect(r.isError).toBe(true)
    expect(r.payload).toMatchObject({ code: "INSUFFICIENT_SCOPE", requiredScope: "plan:write" })
    noServiceCalled()
  })

  it.each(["dev", "stakeholder"])("a %s is FORBIDDEN even with plan:write", async (role) => {
    m.memberFindFirst.mockResolvedValue({ role })
    const r = await callTool(tool, CALLS[tool])
    expect(r.isError).toBe(true)
    expect(r.payload.code).toBe("FORBIDDEN")
    noServiceCalled()
  })

  it("a Scrum Master may", async () => {
    m.memberFindFirst.mockResolvedValue({ role: "sm" })
    expect((await callTool(tool, CALLS[tool])).isError).toBeUndefined()
  })

  it("a non-member gets NOT_FOUND (the project's existence is not confirmed)", async () => {
    m.memberFindFirst.mockResolvedValue(null)
    expect(await callTool(tool, CALLS[tool])).toMatchObject({ isError: true, payload: { error: "Not found", code: "NOT_FOUND" } })
    noServiceCalled()
  })
})

describe("create_plan_item", () => {
  it("creates the row as the token's owner (via mcp) and answers the compact row", async () => {
    const r = await callTool("create_plan_item", { projectId: "p1", name: "据付", parentId: "root1", plannedStart: "2026-11-02", plannedEnd: "2026-11-06", isMilestone: false })
    expect(r.isError).toBeUndefined()
    expect(r.payload.data).toEqual(ANSWER)
    expect(m.createPlanItem).toHaveBeenCalledTimes(1)
    expect(m.createPlanItem).toHaveBeenCalledWith("p1", expect.objectContaining({ name: "据付", parentId: "root1", plannedStart: "2026-11-02", plannedEnd: "2026-11-06" }), MCP_ACTOR)
  })

  it("the answer leaves out linked-PBI figures, sprint names, translations, notes and the owner's mail address", async () => {
    const r = await callTool("create_plan_item", { projectId: "p1", name: "据付" })
    for (const hidden of ["linked", "pbiCount", "Sprint 12", "i18n", "Instalasi", "社内メモ", "社内向けの説明", "example.test"]) expect(r.text).not.toContain(hidden)
  })

  it("an identical call moments later is replayed: one row only", async () => {
    await callTool("create_plan_item", { projectId: "p1", name: "据付" })
    const again = await callTool("create_plan_item", { projectId: "p1", name: "据付" })
    expect(again.payload.replayed).toBe(true)
    expect(m.createPlanItem).toHaveBeenCalledTimes(1)
    await callTool("create_plan_item", { projectId: "p1", name: "据付", idempotencyKey: "second-row" })
    expect(m.createPlanItem).toHaveBeenCalledTimes(2)
  })

  it("cannot make a row that follows its linked PBIs, nor set the display colour: neither is a field of this tool", async () => {
    const all = (await rpc("tools/list", {})).result.tools as Array<{ name: string; inputSchema: { properties: Json } }>
    const fields = Object.keys(all.find((t) => t.name === "create_plan_item")?.inputSchema.properties ?? {})
    expect(fields).toEqual(expect.arrayContaining(["projectId", "name", "parentId", "plannedStart", "plannedEnd", "durationDays", "isMilestone", "status", "ownerId", "description", "notes", "idempotencyKey"]))
    expect(fields).not.toContain("progressMode")
    expect(fields).not.toContain("color")
    // The SDK drops a key the input schema does not have: the row is made, kept by hand.
    await callTool("create_plan_item", { projectId: "p1", name: "据付", progressMode: "linked", color: "#ff0000" })
    expect(m.createPlanItem).toHaveBeenCalledTimes(1)
    expect(m.createPlanItem.mock.calls[0][1]).toEqual({ name: "据付" })
  })

  it("a row without a name is refused before Kanflow runs", async () => {
    const r = await callTool("create_plan_item", { projectId: "p1" })
    expect(r.isError).toBe(true)
    expect(r.text).toMatch(/Input validation error/)
    noServiceCalled()
  })
})

describe("update_plan_item", () => {
  it("sends only the changed fields and the version", async () => {
    const r = await callTool("update_plan_item", { projectId: "p1", itemId: "i1", status: "done", actualEnd: "2026-11-06", version: 7 })
    expect(r.isError).toBeUndefined()
    expect(r.payload.data).toEqual(ANSWER)
    expect(m.updatePlanItem).toHaveBeenCalledWith("p1", "i1", { status: "done", actualEnd: "2026-11-06", version: 7 }, MCP_ACTOR, expect.any(Date), { handKeptFieldsOnly: true })
  })

  it("null clears a date or moves the row to the top level", async () => {
    await callTool("update_plan_item", { projectId: "p1", itemId: "i1", parentId: null, plannedStart: null, plannedEnd: null, version: 7 })
    expect(m.updatePlanItem).toHaveBeenCalledWith("p1", "i1", { parentId: null, plannedStart: null, plannedEnd: null, version: 7 }, MCP_ACTOR, expect.any(Date), { handKeptFieldsOnly: true })
  })

  it("without `version` the call is refused before Kanflow runs: a row is never overwritten blindly", async () => {
    const r = await callTool("update_plan_item", { projectId: "p1", itemId: "i1", status: "done" })
    expect(r.isError).toBe(true)
    expect(r.text).toMatch(/Input validation error/)
    noServiceCalled()
  })

  it("the display order is not a field of this tool", async () => {
    await callTool("update_plan_item", { projectId: "p1", itemId: "i1", name: "据付 2", sortOrder: 0, version: 7 })
    // The SDK drops a key the input schema does not have: the call runs, without it.
    expect(m.updatePlanItem).toHaveBeenCalledTimes(1)
    expect(m.updatePlanItem.mock.calls[0][2]).not.toHaveProperty("sortOrder")
  })

  it("cannot switch a row to follow its linked PBIs (confidential ones would be read back through it), nor set the colour", async () => {
    const all = (await rpc("tools/list", {})).result.tools as Array<{ name: string; inputSchema: { properties: Json } }>
    const fields = Object.keys(all.find((t) => t.name === "update_plan_item")?.inputSchema.properties ?? {})
    expect(fields).toEqual(expect.arrayContaining(["projectId", "itemId", "version", "name", "parentId", "plannedStart", "plannedEnd", "actualStart", "actualEnd", "durationDays", "status", "ownerId", "description", "notes"]))
    for (const absent of ["progressMode", "color", "sortOrder", "isMilestone"]) expect(fields).not.toContain(absent)
    // Sent alone, the two are dropped and nothing is left to change: refused, Kanflow does not run.
    const alone = await callTool("update_plan_item", { projectId: "p1", itemId: "i1", progressMode: "linked", color: "#ff0000", version: 7 })
    expect(alone.payload.code).toBe("VALIDATION")
    noServiceCalled()
    // Sent with a real change, the change runs without them.
    await callTool("update_plan_item", { projectId: "p1", itemId: "i1", name: "据付 2", progressMode: "linked", color: "#ff0000", version: 7 })
    expect(m.updatePlanItem).toHaveBeenCalledWith("p1", "i1", { name: "据付 2", version: 7 }, MCP_ACTOR, expect.any(Date), { handKeptFieldsOnly: true })
  })

  it("cannot turn an existing row into a milestone: Kanflow refuses that switch when a PBI is linked, a confidential one included", async () => {
    // Sent alone it is dropped and nothing is left to change; with a real change the change runs without it.
    const alone = await callTool("update_plan_item", { projectId: "p1", itemId: "i1", isMilestone: true, version: 7 })
    expect(alone.payload.code).toBe("VALIDATION")
    noServiceCalled()
    await callTool("update_plan_item", { projectId: "p1", itemId: "i1", name: "据付 2", isMilestone: true, version: 7 })
    expect(m.updatePlanItem.mock.calls[0][2]).toEqual({ name: "据付 2", version: 7 })
  })

  it("every call asks Kanflow for the token writer's rule; its refusal for a row that follows its PBIs comes back with the code only", async () => {
    m.updatePlanItem.mockRejectedValue(new ValidationError("進捗を紐づく PBI に合わせる項目の状態と実績日は、ここからは変更できません", {}, "PLAN_FOLLOWS_PBIS"))
    const r = await callTool("update_plan_item", { projectId: "p1", itemId: "i1", status: "done", version: 7 })
    expect(m.updatePlanItem.mock.calls[0][5]).toEqual({ handKeptFieldsOnly: true })
    expect(r.isError).toBe(true)
    expect(r.payload).toEqual({ error: expect.any(String), code: "PLAN_FOLLOWS_PBIS" })
  })

  it("the answer for a row that follows its linked PBIs carries no actual dates (they may come from a confidential PBI)", async () => {
    m.updatePlanItem.mockResolvedValue({ ...DTO, progressMode: "linked", status: "done", progressPct: 100, actualEnd: "2026-11-09" })
    const r = await callTool("update_plan_item", { projectId: "p1", itemId: "i1", name: "据付 2", version: 7 })
    expect(r.payload.data).toEqual({ ...ANSWER, status: "done", progressPct: 100, actualStart: null, actualEnd: null })
    expect(r.text).not.toContain("2026-11-03")
    expect(r.text).not.toContain("2026-11-09")
  })

  it("a call that changes nothing is refused", async () => {
    const r = await callTool("update_plan_item", { projectId: "p1", itemId: "i1", version: 7 })
    expect(r.isError).toBe(true)
    expect(r.payload.code).toBe("VALIDATION")
    noServiceCalled()
  })

  it("a stale version is VERSION_CONFLICT; the row as it is now does not leave Kanflow with the refusal", async () => {
    m.updatePlanItem.mockRejectedValue(new VersionConflictError(DTO))
    const r = await callTool("update_plan_item", { projectId: "p1", itemId: "i1", status: "done", version: 6 })
    expect(r.isError).toBe(true)
    expect(r.payload).toEqual({ error: expect.any(String), code: "VERSION_CONFLICT" })
    expect(r.text).not.toContain("Sprint 12")
  })

  it("the same change twice is two calls (the second one meets the new version)", async () => {
    await callTool("update_plan_item", CALLS.update_plan_item)
    await callTool("update_plan_item", CALLS.update_plan_item)
    expect(m.updatePlanItem).toHaveBeenCalledTimes(2)
  })
})

describe("set_plan_dependencies", () => {
  it("replaces the item's list and answers ids and counts only, the ids it took away included", async () => {
    m.setPredecessors.mockResolvedValue({ successorId: "i1", dependsOn: ["i0"], added: 1, removed: 1, removedIds: ["i9"] })
    const r = await callTool("set_plan_dependencies", { projectId: "p1", itemId: "i1", dependsOn: ["i0"] })
    expect(r.isError).toBeUndefined()
    expect(r.payload.data).toEqual({ successorId: "i1", dependsOn: ["i0"], added: 1, removed: 1, removedIds: ["i9"] })
    expect(m.setPredecessors).toHaveBeenCalledWith("p1", "i1", ["i0"], MCP_ACTOR)
  })

  it("[] clears the list; leaving `dependsOn` out is refused (it would read as 'clear')", async () => {
    await callTool("set_plan_dependencies", { projectId: "p1", itemId: "i1", dependsOn: [] })
    expect(m.setPredecessors).toHaveBeenCalledWith("p1", "i1", [], MCP_ACTOR)
    m.setPredecessors.mockClear()
    const r = await callTool("set_plan_dependencies", { projectId: "p1", itemId: "i1" })
    expect(r.isError).toBe(true)
    expect(r.text).toMatch(/Input validation error/)
    expect(m.setPredecessors).not.toHaveBeenCalled()
  })

  it("more than 50 ids are refused before Kanflow runs", async () => {
    const r = await callTool("set_plan_dependencies", { projectId: "p1", itemId: "i1", dependsOn: Array.from({ length: 51 }, (_, i) => `i${i}`) })
    expect(r.isError).toBe(true)
    expect(m.setPredecessors).not.toHaveBeenCalled()
  })
})

describe("toPlanItemAnswer", () => {
  it("keeps exactly the fields get_plan shows for a node", () => {
    expect(toPlanItemAnswer(DTO as never)).toEqual(ANSWER)
    expect(toPlanItemAnswer({ ...DTO, owner: null } as never).owner).toBeNull()
  })

  it.each(["linked", "something-new", undefined])("progress mode %s: no actual dates", (progressMode) => {
    expect(toPlanItemAnswer({ ...DTO, actualEnd: "2026-11-09", progressMode } as never)).toEqual({ ...ANSWER, actualStart: null, actualEnd: null })
  })
})
