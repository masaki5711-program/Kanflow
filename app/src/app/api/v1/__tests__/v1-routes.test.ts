import { beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  memberFindFirst: vi.fn(),
  projectFindFirst: vi.fn(),
  projectSectionFindFirst: vi.fn(),
  loadUserAuthState: vi.fn(),
  auth: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({ auth: m.auth }))
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

const repo = await import("@/services/api-tokens/api-tokens.repository")
const v1 = await import("@/services/api-v1/api-v1.service")
const { generateApiToken } = await import("@/lib/api-tokens/token")
const { resetApiTokenTouchCache } = await import("@/services/api-tokens/api-token-auth")
const { NotFoundError } = await import("@/services/_shared/errors")

const meRoute = await import("@/app/api/v1/me/route")
const projectsRoute = await import("@/app/api/v1/projects/route")
const projectRoute = await import("@/app/api/v1/projects/[projectId]/route")
const backlogRoute = await import("@/app/api/v1/projects/[projectId]/backlog/route")
const sprintsRoute = await import("@/app/api/v1/projects/[projectId]/sprints/route")
const tasksRoute = await import("@/app/api/v1/projects/[projectId]/sprints/[sprintId]/tasks/route")
const planRoute = await import("@/app/api/v1/projects/[projectId]/plan/route")
const releasesRoute = await import("@/app/api/v1/projects/[projectId]/releases/route")
const activityRoute = await import("@/app/api/v1/projects/[projectId]/activity/route")

const token = generateApiToken()
const BASE = "http://localhost/api/v1"

function get(path: string, auth: string | null = `Bearer ${token.token}`, extra: Record<string, string> = {}): Request {
  const headers = new Headers(extra)
  if (auth !== null) headers.set("authorization", auth)
  return new Request(`${BASE}${path}`, { headers })
}
const none = { params: Promise.resolve({}) as Promise<Record<string, never>> }
const project = (projectId = "p1") => ({ params: Promise.resolve({ projectId }) })

function tokenRow(over: Record<string, unknown> = {}) {
  return {
    id: "t1", userId: "u1", prefix: token.prefix, scopes: '["read"]', projectIds: null, userTokenVersion: 0,
    expiresAt: null, revokedAt: null, lastUsedAt: null, ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  delete (globalThis as { __kanflowRateLimiters?: unknown }).__kanflowRateLimiters
  resetApiTokenTouchCache()
  vi.mocked(repo.findTokenByHash).mockResolvedValue(tokenRow() as never)
  vi.mocked(repo.touchLastUsed).mockResolvedValue({ count: 1 })
  m.loadUserAuthState.mockResolvedValue({ isActive: true, role: "member", tokenVersion: 0 })
  m.projectFindFirst.mockResolvedValue({ id: "p1" })
  m.memberFindFirst.mockResolvedValue({ role: "dev" })
  m.projectSectionFindFirst.mockResolvedValue(null)
})

describe("GET /api/v1/* authentication", () => {
  it("serves the envelope with rate-limit headers and no caching", async () => {
    vi.mocked(v1.getMe).mockResolvedValue({ data: { id: "u1" } } as never)
    const res = await meRoute.GET(get("/me"), none)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { id: "u1" } })
    expect(res.headers.get("X-RateLimit-Limit")).toBe("120")
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("119")
    expect(res.headers.get("Cache-Control")).toBe("no-store")
    expect(v1.getMe).toHaveBeenCalledWith("u1")
  })

  it.each([
    ["missing token", null, undefined],
    ["invalid token", "Bearer kfl_nope", undefined],
    ["unknown token", `Bearer ${token.token}`, () => vi.mocked(repo.findTokenByHash).mockResolvedValue(null)],
    ["revoked token", `Bearer ${token.token}`, () => vi.mocked(repo.findTokenByHash).mockResolvedValue(tokenRow({ revokedAt: new Date() }) as never)],
    ["expired token", `Bearer ${token.token}`, () => vi.mocked(repo.findTokenByHash).mockResolvedValue(tokenRow({ expiresAt: new Date(Date.now() - 1000) }) as never)],
    ["deactivated user", `Bearer ${token.token}`, () => m.loadUserAuthState.mockResolvedValue({ isActive: false, role: "member", tokenVersion: 0 })],
    ["revoked sessions (tokenVersion bump)", `Bearer ${token.token}`, () => m.loadUserAuthState.mockResolvedValue({ isActive: true, role: "member", tokenVersion: 1 })],
  ])("401 { error, code } for a %s", async (_label, header, arrange) => {
    arrange?.()
    const res = await meRoute.GET(get("/me", header), none)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "Unauthorized", code: "UNAUTHORIZED" })
    expect(res.headers.get("WWW-Authenticate")).toContain("Bearer")
    expect(v1.getMe).not.toHaveBeenCalled()
  })

  it("does not accept a session cookie (auth() is never consulted)", async () => {
    m.auth.mockResolvedValue({ user: { id: "u1", role: "admin" } })
    const res = await meRoute.GET(get("/me", null, { cookie: "authjs.session-token=x" }), none)
    expect(res.status).toBe(401)
    expect(m.auth).not.toHaveBeenCalled()
  })

  it("429 with Retry-After once the per-token budget is spent", async () => {
    vi.stubEnv("API_V1_RATE_LIMIT_PER_MIN", "1")
    vi.mocked(v1.getMe).mockResolvedValue({ data: {} } as never)
    expect((await meRoute.GET(get("/me"), none)).status).toBe(200)
    const res = await meRoute.GET(get("/me"), none)
    expect(res.status).toBe(429)
    expect(res.headers.get("Retry-After")).toBeTruthy()
    expect(await res.json()).toMatchObject({ code: "RATE_LIMITED" })
  })

  it("fails closed: a DB error during the token lookup is a 500 envelope", async () => {
    vi.mocked(repo.findTokenByHash).mockRejectedValue(new Error("db down"))
    const res = await meRoute.GET(get("/me"), none)
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "Internal error", code: "INTERNAL" })
  })
})

describe("token project restriction", () => {
  it("404s a project outside the token's list without any project lookup", async () => {
    vi.mocked(repo.findTokenByHash).mockResolvedValue(tokenRow({ projectIds: '["p1"]' }) as never)
    const res = await projectRoute.GET(get("/projects/p2"), project("p2"))
    expect(res.status).toBe(404)
    expect(m.memberFindFirst).not.toHaveBeenCalled()
    expect(v1.getProject).not.toHaveBeenCalled()
  })

  it("serves a listed project and passes the list to the project list", async () => {
    vi.mocked(repo.findTokenByHash).mockResolvedValue(tokenRow({ projectIds: '["p1"]' }) as never)
    vi.mocked(v1.getProject).mockResolvedValue({ data: { id: "p1" } } as never)
    expect((await projectRoute.GET(get("/projects/p1"), project())).status).toBe(200)
    vi.mocked(v1.listProjects).mockResolvedValue({ data: [] } as never)
    await projectsRoute.GET(get("/projects"), none)
    expect(v1.listProjects).toHaveBeenCalledWith({ id: "u1", role: "member" }, { status: "active" }, ["p1"])
  })
})

describe("assertV1Action (token scope ∩ project role)", () => {
  const principal = (scopes: string[]) =>
    ({ userId: "u1", role: "member", tokenId: "t1", tokenPrefix: "kfl_x", scopes, projectIds: null }) as never
  const actor = (projectRole: string) => ({ userId: "u1", systemRole: "member", projectRole, isSectionManagerOfProject: false })

  it("403 INSUFFICIENT_SCOPE naming the scope when the token lacks it, even for a PO", async () => {
    const { assertV1Action } = await import("@/app/api/v1/_lib/v1-route")
    expect(() => assertV1Action(principal(["read"]), actor("po"), "backlog.write")).toThrow(
      expect.objectContaining({ status: 403, code: "INSUFFICIENT_SCOPE", extra: { requiredScope: "backlog:write" } })
    )
  })

  it("403 FORBIDDEN when the scope is there but the role is not (dev creating a PBI)", async () => {
    const { assertV1Action } = await import("@/app/api/v1/_lib/v1-route")
    expect(() => assertV1Action(principal(["read", "backlog:write"]), actor("dev"), "backlog.write")).toThrow(
      expect.objectContaining({ status: 403, code: "FORBIDDEN" })
    )
  })

  it("v1 bodies keep requiredScope but drop other service extras", async () => {
    const { ForbiddenError, ValidationError } = await import("@/services/_shared/errors")
    vi.mocked(v1.getProject).mockRejectedValueOnce(new ForbiddenError("Insufficient scope", { requiredScope: "task:write" }, "INSUFFICIENT_SCOPE"))
    let res = await projectRoute.GET(get("/projects/p1"), project())
    expect(await res.json()).toEqual({ error: "Insufficient scope", code: "INSUFFICIENT_SCOPE", requiredScope: "task:write" })
    vi.mocked(v1.getProject).mockRejectedValueOnce(new ValidationError("Bad", { otherPbiId: "x" }, "VALIDATION"))
    res = await projectRoute.GET(get("/projects/p1"), project())
    expect(await res.json()).toEqual({ error: "Bad", code: "VALIDATION" })
  })

  it("passes when both allow it", async () => {
    const { assertV1Action } = await import("@/app/api/v1/_lib/v1-route")
    expect(() => assertV1Action(principal(["read", "task:write"]), actor("dev"), "task.write")).not.toThrow()
    expect(() => assertV1Action(principal(["read", "sprint:write"]), actor("sm"), "sprint.manage")).not.toThrow()
  })

  it("no token may do an action without a scope (e.g. project.delete)", async () => {
    const { assertV1Action } = await import("@/app/api/v1/_lib/v1-route")
    expect(() => assertV1Action(principal(["read"]), actor("po"), "project.delete")).toThrow(
      expect.objectContaining({ code: "INSUFFICIENT_SCOPE" })
    )
  })
})

describe("project routes", () => {
  it("lists accessible projects with the DB role", async () => {
    m.loadUserAuthState.mockResolvedValue({ isActive: true, role: "section_manager", tokenVersion: 0 })
    vi.mocked(v1.listProjects).mockResolvedValue({ data: [] } as never)
    const res = await projectsRoute.GET(get("/projects?status=archived"), none)
    expect(res.status).toBe(200)
    expect(v1.listProjects).toHaveBeenCalledWith({ id: "u1", role: "section_manager" }, { status: "archived" }, null)
  })

  it("400 { error, code } for a bad query", async () => {
    const res = await projectsRoute.GET(get("/projects?status=deleted"), none)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe("VALIDATION")
    expect(typeof body.error).toBe("string")
  })

  it("404 for another project (no membership) without calling the service", async () => {
    m.memberFindFirst.mockResolvedValue(null)
    const res = await projectRoute.GET(get("/projects/p2"), project("p2"))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "Not found", code: "NOT_FOUND" })
    expect(v1.getProject).not.toHaveBeenCalled()
  })

  it("404 for a trashed project, admins included", async () => {
    m.loadUserAuthState.mockResolvedValue({ isActive: true, role: "admin", tokenVersion: 0 })
    m.projectFindFirst.mockResolvedValue(null)
    expect((await projectRoute.GET(get("/projects/p1"), project())).status).toBe(404)
  })

  it("section managers of the project's section may read", async () => {
    m.loadUserAuthState.mockResolvedValue({ isActive: true, role: "section_manager", tokenVersion: 0 })
    m.memberFindFirst.mockResolvedValue(null)
    m.projectSectionFindFirst.mockResolvedValue({ sectionId: "s1" })
    vi.mocked(v1.getProject).mockResolvedValue({ data: { id: "p1" } } as never)
    expect((await projectRoute.GET(get("/projects/p1"), project())).status).toBe(200)
  })

  it("backlog: parses filters and pagination, returns nextCursor", async () => {
    vi.mocked(v1.listBacklog).mockResolvedValue({ data: [{ id: "b1" }], nextCursor: "abc" } as never)
    const res = await backlogRoute.GET(get("/projects/p1/backlog?status=ready&limit=10&cursor=abc"), project())
    expect(await res.json()).toEqual({ data: [{ id: "b1" }], nextCursor: "abc" })
    expect(v1.listBacklog).toHaveBeenCalledWith("p1", { status: "ready", limit: 10, cursor: "abc" })
  })

  it("backlog: rejects a limit above the maximum", async () => {
    expect((await backlogRoute.GET(get("/projects/p1/backlog?limit=1000"), project())).status).toBe(400)
  })

  it("backlog: a malformed cursor is a 400 service error", async () => {
    const { ValidationError } = await import("@/services/_shared/errors")
    vi.mocked(v1.listBacklog).mockRejectedValue(new ValidationError("Invalid cursor", {}, "VALIDATION"))
    const res = await backlogRoute.GET(get("/projects/p1/backlog?cursor=zzz"), project())
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "Invalid cursor", code: "VALIDATION" })
  })

  it("sprint tasks: passes the sprint id; unknown sprint → 404 with its code", async () => {
    vi.mocked(v1.listSprintTasks).mockRejectedValue(new NotFoundError("Sprint not found", {}, "SPRINT_NOT_FOUND"))
    const res = await tasksRoute.GET(get("/projects/p1/sprints/s9/tasks"), { params: Promise.resolve({ projectId: "p1", sprintId: "s9" }) })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "Sprint not found", code: "SPRINT_NOT_FOUND" })
    expect(v1.listSprintTasks).toHaveBeenCalledWith("p1", "s9")
  })

  it("sprints / plan / releases / activity delegate to the service", async () => {
    vi.mocked(v1.listSprints).mockResolvedValue({ data: [] } as never)
    vi.mocked(v1.listPlan).mockResolvedValue({ data: [] } as never)
    vi.mocked(v1.listReleases).mockResolvedValue({ data: [] } as never)
    vi.mocked(v1.listActivity).mockResolvedValue({ data: [], nextCursor: null } as never)
    expect((await sprintsRoute.GET(get("/projects/p1/sprints"), project())).status).toBe(200)
    expect((await planRoute.GET(get("/projects/p1/plan"), project())).status).toBe(200)
    expect((await releasesRoute.GET(get("/projects/p1/releases"), project())).status).toBe(200)
    expect((await activityRoute.GET(get("/projects/p1/activity?limit=5&entityType=pbi"), project())).status).toBe(200)
    expect(v1.listActivity).toHaveBeenCalledWith("p1", { limit: 5, entityType: "pbi" })
  })

  it("an unexpected service failure is a 500 envelope", async () => {
    vi.mocked(v1.listPlan).mockRejectedValue(new Error("boom"))
    const res = await planRoute.GET(get("/projects/p1/plan"), project())
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "Internal error", code: "INTERNAL" })
  })
})
