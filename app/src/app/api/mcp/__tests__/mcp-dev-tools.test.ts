import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * MCP developer tools (K5, scope dev:write): wiring to the dev-work service through
 * the shared write path (scope ∩ role, via "mcp", idempotency), project resolution
 * from the PBI / task, and the error shape. The service itself is mocked.
 */

const m = vi.hoisted(() => ({
  memberFindFirst: vi.fn(),
  projectFindFirst: vi.fn(),
  projectSectionFindFirst: vi.fn(),
  loadUserAuthState: vi.fn(),
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
vi.mock("@/services/dev-work/dev-work.service")

const repo = await import("@/services/api-tokens/api-tokens.repository")
const v1 = await import("@/services/api-v1/api-v1.service")
const realV1 = await vi.importActual<typeof import("@/services/api-v1/api-v1.service")>("@/services/api-v1/api-v1.service")
const dev = await import("@/services/dev-work/dev-work.service")
const { generateApiToken } = await import("@/lib/api-tokens/token")
const { resetApiTokenTouchCache } = await import("@/services/api-tokens/api-token-auth")
const { resetIdempotencyStore } = await import("@/app/api/v1/_lib/v1-write")
const { CREATE_NOTE, DATA_NOTICE } = await import("@/app/api/mcp/_lib/tool-kit")
const { ConflictError, ValidationError } = await import("@/services/_shared/errors")
const mcpRoute = await import("@/app/api/mcp/route")

const token = generateApiToken()
const MCP_ACTOR = { userId: "u1", userName: "Dev One", systemRole: "member", via: "mcp" }
const CLAIM = { id: "c1", projectId: "p1", pbi: { id: "b1", displayId: 12, title: "Login" }, task: null, sessionId: "s-1", active: true }
const MR_URL = "https://gitlab.scm.service.infosys.yamaha.com/grp/api/-/merge_requests/7"
const DEV_TOOLS = ["claim_work", "release_claim", "list_claims", "post_progress", "link_merge_request"]

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

async function callTool(name: string, args: Record<string, unknown>) {
  const msg = await rpc("tools/call", { name, arguments: args })
  const result = msg.result as { isError?: boolean; content: Array<{ text: string }> }
  const text = result.content[0].text
  return { isError: result.isError, payload: (text.startsWith("{") ? JSON.parse(text) : { text }) as Record<string, unknown> }
}

const withScopes = (scopes: string, projectIds: string | null = null) =>
  vi.mocked(repo.findTokenByHash).mockResolvedValue({
    id: "t1", userId: "u1", prefix: token.prefix, scopes, projectIds, userTokenVersion: 0, expiresAt: null, revokedAt: null, lastUsedAt: null,
  } as never)

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  delete (globalThis as { __kanflowRateLimiters?: unknown }).__kanflowRateLimiters
  resetApiTokenTouchCache()
  resetIdempotencyStore()
  withScopes('["read","dev:write"]')
  vi.mocked(repo.touchLastUsed).mockResolvedValue({ count: 1 })
  m.loadUserAuthState.mockResolvedValue({ isActive: true, role: "member", tokenVersion: 0 })
  m.projectFindFirst.mockResolvedValue({ id: "p1" })
  m.projectSectionFindFirst.mockResolvedValue(null)
  m.memberFindFirst.mockResolvedValue({ role: "dev" })
  vi.mocked(v1.parsePbiRef).mockImplementation(realV1.parsePbiRef)
  vi.mocked(v1.loadApiActor).mockResolvedValue({ userId: "u1", userName: "Dev One", systemRole: "member", via: "api" })
  vi.mocked(v1.getPbi).mockResolvedValue({ data: { id: "b1", displayId: 12 } } as never)
  vi.mocked(v1.locateEntity).mockResolvedValue({ projectId: "p1", sprintId: "s1" })
  vi.mocked(dev.claimWork).mockResolvedValue({ claim: CLAIM, created: true, takenOver: [] } as never)
  vi.mocked(dev.releaseClaim).mockResolvedValue({ claim: { ...CLAIM, active: false } } as never)
  vi.mocked(dev.listClaims).mockResolvedValue({ data: [CLAIM], staleAfterHours: 4 } as never)
  vi.mocked(dev.postProgress).mockResolvedValue({ id: "cm1", via: "mcp" } as never)
  vi.mocked(dev.linkMergeRequest).mockResolvedValue({ link: { id: "l1", ref: "7", declared: true }, created: true } as never)
})

describe("tool list", () => {
  it("offers the developer tools with the data notice; none of them changes a status", async () => {
    const msg = await rpc("tools/list", {})
    const tools = (msg.result.tools as Array<{ name: string; description: string; inputSchema: { properties?: Record<string, unknown> } }>).filter((t) =>
      DEV_TOOLS.includes(t.name),
    )
    expect(tools.map((t) => t.name).sort()).toEqual([...DEV_TOOLS].sort())
    for (const t of tools) {
      expect(t.description).toContain(DATA_NOTICE)
      expect(Object.keys(t.inputSchema.properties ?? {})).not.toContain("status")
    }
    expect(tools.find((t) => t.name === "post_progress")?.description).toContain(CREATE_NOTE)
    expect(tools.find((t) => t.name === "claim_work")?.description).toMatch(/TASK_CLAIMED/)
    expect(Object.keys(tools.find((t) => t.name === "claim_work")?.inputSchema.properties ?? {})).toContain("takeover")
  })
})

describe("scope dev:write", () => {
  it.each([
    ["claim_work", { pbi: "PBI-12", projectId: "p1", sessionId: "s-1" }],
    ["release_claim", { claimId: "c1", projectId: "p1" }],
    ["post_progress", { entityType: "pbi", entityId: "PBI-12", projectId: "p1", body: "done" }],
    ["link_merge_request", { pbi: "PBI-12", projectId: "p1", url: MR_URL }],
  ])("%s without dev:write (every other scope) → INSUFFICIENT_SCOPE naming dev:write, service not called", async (tool, args) => {
    withScopes('["read","backlog:write","backlog:reorder","sprint:write","task:write","comment:write","icebox:write","daily:write"]')
    const r = await callTool(tool, args)
    expect(r.isError).toBe(true)
    expect(r.payload).toMatchObject({ code: "INSUFFICIENT_SCOPE", requiredScope: "dev:write" })
    expect(String(r.payload.hint)).toContain("dev:write")
    for (const fn of [dev.claimWork, dev.releaseClaim, dev.postProgress, dev.linkMergeRequest]) expect(fn).not.toHaveBeenCalled()
  })

  it("list_claims is a read (read scope is enough)", async () => {
    withScopes('["read"]')
    const r = await callTool("list_claims", { projectId: "p1", pbi: "PBI-12" })
    expect(r).toEqual({ isError: undefined, payload: { data: [CLAIM], staleAfterHours: 4 } })
    expect(dev.listClaims).toHaveBeenCalledWith("p1", { pbi: "PBI-12" }, "u1")
  })
})

describe("claim_work / release_claim", () => {
  it("claims a PBI as the token user via mcp", async () => {
    const r = await callTool("claim_work", { pbi: "PBI-12", projectId: "p1", sessionId: "s-1", branch: "feat/L3-PBI-12-login" })
    expect(r.isError).toBeUndefined()
    expect(r.payload).toEqual({ data: CLAIM, created: true, takenOver: [] })
    expect(dev.claimWork).toHaveBeenCalledWith("p1", { pbi: "b1", sessionId: "s-1", branch: "feat/L3-PBI-12-login" }, MCP_ACTOR)
  })

  it("a target held by another user/session is a tool error TASK_CLAIMED with the holders; takeover is passed through", async () => {
    const holders = [{ claimId: "c0", user: { id: "u2", name: "Dev Two" }, sessionId: "other", branch: null, claimedAt: "x", lastHeartbeatAt: "y" }]
    vi.mocked(dev.claimWork).mockRejectedValueOnce(new ConflictError("Someone else is working on this", { holders }, "TASK_CLAIMED"))
    const r = await callTool("claim_work", { taskId: "k1", sessionId: "s-1" })
    expect(r).toEqual({ isError: true, payload: { error: "Someone else is working on this", code: "TASK_CLAIMED", holders } })
    await callTool("claim_work", { taskId: "k1", sessionId: "s-1", takeover: true })
    expect(dev.claimWork).toHaveBeenLastCalledWith("p1", { taskId: "k1", sessionId: "s-1", takeover: true }, MCP_ACTOR)
  })

  it("claims a task: the project comes from the task; a repeated call is a heartbeat (not deduplicated away)", async () => {
    await callTool("claim_work", { taskId: "k1", sessionId: "s-1" })
    await callTool("claim_work", { taskId: "k1", sessionId: "s-1" })
    expect(v1.locateEntity).toHaveBeenCalledWith("task", "k1")
    expect(dev.claimWork).toHaveBeenCalledTimes(2)
    expect(dev.claimWork).toHaveBeenCalledWith("p1", { taskId: "k1", sessionId: "s-1" }, MCP_ACTOR)
  })

  it("VALIDATION for both or neither of pbi / taskId; NOT_FOUND for a task of another project", async () => {
    expect((await callTool("claim_work", { sessionId: "s-1", projectId: "p1" })).payload.code).toBe("VALIDATION")
    expect((await callTool("claim_work", { pbi: "12", taskId: "k1", sessionId: "s-1", projectId: "p1" })).payload.code).toBe("VALIDATION")
    vi.mocked(v1.locateEntity).mockResolvedValue({ projectId: "p2", sprintId: "s9" })
    const r = await callTool("claim_work", { taskId: "k9", projectId: "p1", sessionId: "s-1" })
    expect(r.payload.code).toBe("NOT_FOUND")
    expect(dev.claimWork).not.toHaveBeenCalled()
  })

  it("a session id with spaces is refused by the input schema (plain-text SDK error)", async () => {
    const r = await callTool("claim_work", { pbi: "12", projectId: "p1", sessionId: "my session" })
    expect(r.isError).toBe(true)
    expect(String(r.payload.text)).toMatch(/Input validation error/)
  })

  it("release_claim runs for the claim's project as the token user", async () => {
    const r = await callTool("release_claim", { claimId: "c1", projectId: "p1" })
    expect(r.payload).toEqual({ data: { ...CLAIM, active: false } })
    expect(dev.releaseClaim).toHaveBeenCalledWith("p1", "c1", MCP_ACTOR, { canModerate: false })
  })

  it("NOT_FOUND for a project outside the token's restriction", async () => {
    withScopes('["read","dev:write"]', '["p9"]')
    expect((await callTool("release_claim", { claimId: "c1", projectId: "p1" })).payload.code).toBe("NOT_FOUND")
    expect((await callTool("list_claims", { projectId: "p1" })).payload.code).toBe("NOT_FOUND")
  })
})

describe("post_progress / link_merge_request", () => {
  it("posts progress on a PBI (number resolved) as via mcp; an identical retry within 2 minutes is replayed, not posted twice", async () => {
    const args = { entityType: "pbi", entityId: "PBI-12", projectId: "p1", body: "API done; tests green" }
    const first = await callTool("post_progress", args)
    const again = await callTool("post_progress", args)
    expect(first.payload).toEqual({ data: { id: "cm1", via: "mcp" } })
    expect(again.payload).toEqual({ data: { id: "cm1", via: "mcp" }, replayed: true })
    expect(dev.postProgress).toHaveBeenCalledTimes(1)
    expect(dev.postProgress).toHaveBeenCalledWith("p1", { entityType: "pbi", entityId: "b1", body: "API done; tests green" }, MCP_ACTOR, false)
  })

  it("posts progress on a task (project from the task); a distinct idempotencyKey posts again", async () => {
    await callTool("post_progress", { entityType: "sprint_task", entityId: "k1", body: "WIP", idempotencyKey: "a" })
    await callTool("post_progress", { entityType: "sprint_task", entityId: "k1", body: "WIP", idempotencyKey: "b" })
    expect(dev.postProgress).toHaveBeenCalledTimes(2)
    expect(v1.locateEntity).toHaveBeenCalledWith("task", "k1")
  })

  it("links an MR; the service's URL refusals come back as tool errors with their code", async () => {
    const ok = await callTool("link_merge_request", { pbi: "PBI-12", projectId: "p1", url: MR_URL })
    expect(ok.payload).toEqual({ data: { id: "l1", ref: "7", declared: true }, created: true })
    expect(dev.linkMergeRequest).toHaveBeenCalledWith("p1", { pbi: "b1", url: MR_URL }, MCP_ACTOR)
    vi.mocked(dev.linkMergeRequest).mockRejectedValue(new ValidationError("not registered", {}, "MR_REPOSITORY_NOT_REGISTERED"))
    const bad = await callTool("link_merge_request", { pbi: "PBI-12", projectId: "p1", url: "https://gitlab.scm.service.infosys.yamaha.com/x/y/-/merge_requests/1" })
    expect(bad).toEqual({ isError: true, payload: { error: "not registered", code: "MR_REPOSITORY_NOT_REGISTERED" } })
  })
})
