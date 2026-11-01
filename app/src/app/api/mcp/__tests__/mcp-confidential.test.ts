import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Confidential PBIs (D-5) through the REAL MCP route: token auth, resolveV1ProjectActor, the tool, the
 * v1 operation, the repository filter and the masking helpers all run over the in-memory Prisma stand-in
 * (services/api-v1/__tests__/confidential-fixture.ts). Only the write services below the operations are
 * mocked, to see which id they receive. The enumeration of all tools lives in
 * v1/__tests__/confidential-enforcement.test.ts.
 */

const m = vi.hoisted(() => ({
  memberFindFirst: vi.fn(),
  projectFindFirst: vi.fn(),
  projectSectionFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
  loadUserAuthState: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/prisma", async () => ({
  prisma: {
    ...(await import("@/services/api-v1/__tests__/confidential-fixture")).confidentialDb,
    projectMember: { findFirst: m.memberFindFirst },
    project: { findFirst: m.projectFindFirst },
    projectSection: { findFirst: m.projectSectionFindFirst },
    user: { findUnique: m.userFindUnique },
  },
}))
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}))
vi.mock("@/lib/authz/session-validity", async (orig) => ({
  ...(await orig<typeof import("@/lib/authz/session-validity")>()),
  loadUserAuthState: m.loadUserAuthState,
}))
vi.mock("@/services/_shared/translations", () => ({ getI18nFor: vi.fn(async () => new Map()) }))
vi.mock("@/services/api-tokens/api-tokens.repository")
vi.mock("@/services/sprint-backlog/sprint-backlog.service")
vi.mock("@/services/comments/comments.service")
vi.mock("@/services/dev-work/dev-work.service")

const repo = await import("@/services/api-tokens/api-tokens.repository")
const sprintBacklog = await import("@/services/sprint-backlog/sprint-backlog.service")
const comments = await import("@/services/comments/comments.service")
const devWork = await import("@/services/dev-work/dev-work.service")
const { leaksSecret } = await import("@/services/api-v1/__tests__/confidential-fixture")
const { generateApiToken } = await import("@/lib/api-tokens/token")
const { resetApiTokenTouchCache } = await import("@/services/api-tokens/api-token-auth")
const { resetIdempotencyStore } = await import("@/app/api/v1/_lib/v1-write")
const mcpRoute = await import("@/app/api/mcp/route")

const token = generateApiToken()
const SCOPES = '["read","task:write","comment:write","dev:write"]'

async function callTool(name: string, args: Record<string, unknown>) {
  const res = await mcpRoute.POST(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { authorization: `Bearer ${token.token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    })
  )
  const msg = (await res.json()) as { result: { isError?: boolean; content: Array<{ text: string }> } }
  return { isError: msg.result.isError === true, payload: JSON.parse(msg.result.content[0].text) as Record<string, unknown> & { data?: unknown } }
}

beforeEach(() => {
  vi.clearAllMocks()
  delete (globalThis as { __kanflowRateLimiters?: unknown }).__kanflowRateLimiters
  resetApiTokenTouchCache()
  resetIdempotencyStore()
  vi.mocked(repo.findTokenByHash).mockResolvedValue({
    id: "t1", userId: "u1", prefix: token.prefix, scopes: SCOPES, projectIds: null, userTokenVersion: 0,
    expiresAt: null, revokedAt: null, lastUsedAt: null,
  } as never)
  vi.mocked(repo.touchLastUsed).mockResolvedValue({ count: 1 })
  m.loadUserAuthState.mockResolvedValue({ isActive: true, role: "member", tokenVersion: 0 })
  m.projectFindFirst.mockResolvedValue({ id: "p1" })
  m.projectSectionFindFirst.mockResolvedValue(null)
  m.memberFindFirst.mockResolvedValue({ role: "dev" })
  m.userFindUnique.mockResolvedValue({ name: "Dev One" })
  vi.mocked(comments.listComments).mockResolvedValue({ items: [], nextCursor: null } as never)
})

describe("direct gets: a confidential PBI is 'not found', exactly like a PBI that does not exist", () => {
  it("get_pbi by internal id", async () => {
    const missing = await callTool("get_pbi", { pbi: "nope" })
    const secret = await callTool("get_pbi", { pbi: "pbC" })
    expect(secret).toEqual(missing)
    expect(missing).toMatchObject({ isError: true, payload: { code: "NOT_FOUND" } })
  })

  it("get_pbi by number and PBI-number (needs projectId)", async () => {
    const missing = await callTool("get_pbi", { pbi: "PBI-99", projectId: "p1" })
    expect(missing.payload.code).toBe("PBI_NOT_FOUND")
    for (const pbi of ["2", "PBI-2"]) expect(await callTool("get_pbi", { pbi, projectId: "p1" })).toEqual(missing)
  })

  it("control: a normal PBI is returned", async () => {
    const out = await callTool("get_pbi", { pbi: "PBI-1", projectId: "p1" })
    expect(out.isError).toBe(false)
    expect(out.payload.data).toMatchObject({ id: "pbA", displayId: 1 })
  })

  it("list_comments, add_comment and update_task of the confidential PBI / its task are 'not found' and write nothing", async () => {
    const missing = await callTool("list_comments", { entityType: "pbi", entityId: "nope" })
    expect(await callTool("list_comments", { entityType: "pbi", entityId: "pbC" })).toEqual(missing)
    expect(await callTool("list_comments", { entityType: "sprint_task", entityId: "tC" })).toMatchObject({ isError: true, payload: { code: "NOT_FOUND" } })
    expect((await callTool("add_comment", { entityType: "pbi", entityId: "pbC", body: "hi" })).isError).toBe(true)
    expect((await callTool("update_task", { taskId: "tC", status: "done" })).isError).toBe(true)
    expect((await callTool("claim_work", { pbi: "pbC", sessionId: "s1" })).isError).toBe(true)
    expect((await callTool("claim_work", { taskId: "tC", sessionId: "s1" })).isError).toBe(true)
    expect(comments.createComment).not.toHaveBeenCalled()
    expect(sprintBacklog.updateTask).not.toHaveBeenCalled()
    expect(devWork.claimWork).not.toHaveBeenCalled()
  })

  it("by number, a write on the confidential PBI stops at the lookup and never reaches the service", async () => {
    vi.mocked(devWork.claimWork).mockResolvedValue({ claim: {}, created: true, takenOver: [], superseded: [] } as never)
    const denied = await callTool("claim_work", { pbi: "PBI-2", sessionId: "s1", projectId: "p1" })
    expect(denied).toMatchObject({ isError: true, payload: { code: "PBI_NOT_FOUND" } })
    expect((await callTool("claim_work", { pbi: "PBI-1", sessionId: "s1", projectId: "p1" })).isError).toBe(false)
    expect(vi.mocked(devWork.claimWork).mock.calls.map((c) => c[1].pbi)).toEqual(["pbA"])
  })
})

describe("lists: confidential PBIs, their tasks, release copies and feed rows are simply omitted", () => {
  it("get_backlog", async () => {
    const out = await callTool("get_backlog", { projectId: "p1" })
    expect((out.payload.data as Array<{ id: string }>).map((p) => p.id)).toEqual(["pbA"])
    expect(leaksSecret(out.payload)).toBe(false)
  })

  it("get_sprint_tasks", async () => {
    const out = await callTool("get_sprint_tasks", { sprintId: "s1" })
    expect((out.payload.data as Array<{ id: string }>).map((t) => t.id)).toEqual(["tA"])
    expect(leaksSecret(out.payload)).toBe(false)
  })

  it("my_tasks (one project and every project)", async () => {
    for (const args of [{ projectId: "p1" }, {}]) {
      const out = await callTool("my_tasks", args)
      expect((out.payload.data as Array<{ id: string }>).map((t) => t.id)).toEqual(["tA"])
      expect(leaksSecret(out.payload)).toBe(false)
    }
  })

  it("get_activity", async () => {
    const out = await callTool("get_activity", { projectId: "p1" })
    expect((out.payload.data as Array<{ id: string }>).map((a) => a.id).sort()).toEqual(["a1", "a12", "a3", "a5", "a7", "a9"])
    expect(leaksSecret(out.payload)).toBe(false)
  })
})
