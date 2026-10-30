import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Entity-first tools through the REAL projectScope → locateEntity →
 * api-v1.repository → resolveV1ProjectActor path. Only the Prisma client is a
 * stub (the repo has no MariaDB harness for vitest; DB-backed checks live in
 * the Playwright e2e suites), so the queries and the restriction logic are
 * the production code.
 */

const m = vi.hoisted(() => ({
  memberFindFirst: vi.fn(),
  projectFindFirst: vi.fn(),
  projectSectionFindFirst: vi.fn(),
  taskFindFirst: vi.fn(),
  pbiFindFirst: vi.fn(),
  sprintFindFirst: vi.fn(),
  iceboxFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
  loadUserAuthState: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectMember: { findFirst: m.memberFindFirst },
    project: { findFirst: m.projectFindFirst },
    projectSection: { findFirst: m.projectSectionFindFirst },
    sprintBacklogItem: { findFirst: m.taskFindFirst },
    productBacklogItem: { findFirst: m.pbiFindFirst },
    sprint: { findFirst: m.sprintFindFirst },
    iceboxItem: { findFirst: m.iceboxFindFirst },
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
vi.mock("@/services/api-tokens/api-tokens.repository")
vi.mock("@/services/sprint-backlog/sprint-backlog.service")
vi.mock("@/services/comments/comments.service")

const repo = await import("@/services/api-tokens/api-tokens.repository")
const sprintBacklog = await import("@/services/sprint-backlog/sprint-backlog.service")
const { generateApiToken } = await import("@/lib/api-tokens/token")
const { resetApiTokenTouchCache } = await import("@/services/api-tokens/api-token-auth")
const { resetIdempotencyStore } = await import("@/app/api/v1/_lib/v1-write")
const mcpRoute = await import("@/app/api/mcp/route")

const token = generateApiToken()

async function callTool(name: string, args: Record<string, unknown>) {
  const res = await mcpRoute.POST(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { authorization: `Bearer ${token.token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    })
  )
  const msg = (await res.json()) as { result: { isError?: boolean; content: Array<{ text: string }> } }
  return { isError: msg.result.isError, payload: JSON.parse(msg.result.content[0].text) as Record<string, unknown> }
}

function useToken(projectIds: string | null) {
  vi.mocked(repo.findTokenByHash).mockResolvedValue({
    id: "t1", userId: "u1", prefix: token.prefix, scopes: '["read","task:write"]', projectIds, userTokenVersion: 0,
    expiresAt: null, revokedAt: null, lastUsedAt: null,
  } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  delete (globalThis as { __kanflowRateLimiters?: unknown }).__kanflowRateLimiters
  resetApiTokenTouchCache()
  resetIdempotencyStore()
  useToken(null)
  vi.mocked(repo.touchLastUsed).mockResolvedValue({ count: 1 })
  m.loadUserAuthState.mockResolvedValue({ isActive: true, role: "member", tokenVersion: 0 })
  m.projectFindFirst.mockResolvedValue({ id: "p1" })
  m.projectSectionFindFirst.mockResolvedValue(null)
  m.memberFindFirst.mockResolvedValue({ role: "dev" })
  m.userFindUnique.mockResolvedValue({ name: "Dev One" })
  m.taskFindFirst.mockResolvedValue({ sprintId: "s1", sprint: { projectId: "p1" } })
  m.pbiFindFirst.mockResolvedValue({ projectId: "p1" })
})

describe("entity-first tools on the real lookup path", () => {
  it("control: a task of an allowed project is updated in its own project and sprint", async () => {
    vi.mocked(sprintBacklog.updateTask).mockResolvedValue({ id: "k1" } as never)
    const r = await callTool("update_task", { taskId: "k1", status: "done" })
    expect(r.payload).toEqual({ data: { id: "k1" } })
    expect(m.taskFindFirst).toHaveBeenCalledWith({
      where: { id: "k1", taskName: { not: null }, pbItem: { deletedAt: null } },
      select: { sprintId: true, sprint: { select: { projectId: true } } },
    })
    expect(sprintBacklog.updateTask).toHaveBeenCalledWith("p1", "s1", "k1", { status: "done" }, expect.objectContaining({ userId: "u1", via: "mcp" }))
  })

  it("a task whose project is outside the token's restriction → NOT_FOUND, nothing written, no membership lookup", async () => {
    useToken('["p2"]')
    const r = await callTool("update_task", { taskId: "k1", status: "done" })
    expect(r).toEqual({ isError: true, payload: { error: "Not found", code: "NOT_FOUND" } })
    expect(m.memberFindFirst).not.toHaveBeenCalled()
    expect(sprintBacklog.updateTask).not.toHaveBeenCalled()
  })

  it("a task of another project than the given projectId → NOT_FOUND", async () => {
    m.taskFindFirst.mockResolvedValue({ sprintId: "s9", sprint: { projectId: "p9" } })
    const r = await callTool("update_task", { taskId: "k1", projectId: "p1", status: "done" })
    expect(r.payload).toEqual({ error: "Not found", code: "NOT_FOUND" })
    expect(sprintBacklog.updateTask).not.toHaveBeenCalled()
  })

  it("a PBI id of a restricted project → NOT_FOUND (get_pbi by internal id)", async () => {
    useToken('["p2"]')
    const r = await callTool("get_pbi", { pbi: "clxpbi" })
    expect(r.payload).toEqual({ error: "Not found", code: "NOT_FOUND" })
    expect(m.pbiFindFirst).toHaveBeenCalledWith({ where: { id: "clxpbi", deletedAt: null }, select: { projectId: true } })
  })
})
