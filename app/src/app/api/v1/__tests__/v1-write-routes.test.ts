import { beforeEach, describe, expect, it, vi } from "vitest"

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
vi.mock("@/services/backlog/backlog.service")
vi.mock("@/services/sprints/sprints.service")
vi.mock("@/services/sprint-backlog/sprint-backlog.service")
vi.mock("@/services/comments/comments.service")
vi.mock("@/services/icebox/icebox.service")
vi.mock("@/services/daily-scrums/daily-scrums.service")

const repo = await import("@/services/api-tokens/api-tokens.repository")
const v1 = await import("@/services/api-v1/api-v1.service")
const backlog = await import("@/services/backlog/backlog.service")
const sprints = await import("@/services/sprints/sprints.service")
const sprintBacklog = await import("@/services/sprint-backlog/sprint-backlog.service")
const comments = await import("@/services/comments/comments.service")
const icebox = await import("@/services/icebox/icebox.service")
const daily = await import("@/services/daily-scrums/daily-scrums.service")
const { generateApiToken } = await import("@/lib/api-tokens/token")
const { resetApiTokenTouchCache } = await import("@/services/api-tokens/api-token-auth")
const { resetIdempotencyStore } = await import("@/app/api/v1/_lib/v1-write")
const { NotFoundError, ConflictError } = await import("@/services/_shared/errors")

const backlogRoute = await import("@/app/api/v1/projects/[projectId]/backlog/route")
const pbiRoute = await import("@/app/api/v1/projects/[projectId]/backlog/[itemId]/route")
const sprintsRoute = await import("@/app/api/v1/projects/[projectId]/sprints/route")
const sprintRoute = await import("@/app/api/v1/projects/[projectId]/sprints/[sprintId]/route")
const sprintPbisRoute = await import("@/app/api/v1/projects/[projectId]/sprints/[sprintId]/pbis/route")
const tasksRoute = await import("@/app/api/v1/projects/[projectId]/sprints/[sprintId]/tasks/route")
const taskRoute = await import("@/app/api/v1/projects/[projectId]/sprints/[sprintId]/tasks/[taskId]/route")
const dailyRoute = await import("@/app/api/v1/projects/[projectId]/sprints/[sprintId]/daily-scrums/route")
const commentsRoute = await import("@/app/api/v1/projects/[projectId]/comments/route")
const iceboxRoute = await import("@/app/api/v1/projects/[projectId]/icebox/route")

const token = generateApiToken()
const BASE = "http://localhost/api/v1/projects/p1"
const ALL_SCOPES = '["read","backlog:write","backlog:reorder","sprint:write","task:write","comment:write","icebox:write","daily:write"]'
const API_ACTOR = { userId: "u1", userName: "Dev One", systemRole: "member", via: "api" as const }

function send(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}${path}`, {
    method,
    headers: { authorization: `Bearer ${token.token}`, "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  })
}
const seg = <P extends Record<string, string>>(params: P) => ({ params: Promise.resolve({ projectId: "p1", ...params }) })

function tokenRow(over: Record<string, unknown> = {}) {
  return {
    id: "t1", userId: "u1", prefix: token.prefix, scopes: ALL_SCOPES, projectIds: null, userTokenVersion: 0,
    expiresAt: null, revokedAt: null, lastUsedAt: null, ...over,
  }
}
const asRole = (role: string) => m.memberFindFirst.mockResolvedValue({ role })

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  delete (globalThis as { __kanflowRateLimiters?: unknown }).__kanflowRateLimiters
  resetApiTokenTouchCache()
  resetIdempotencyStore()
  vi.mocked(repo.findTokenByHash).mockResolvedValue(tokenRow() as never)
  vi.mocked(repo.touchLastUsed).mockResolvedValue({ count: 1 })
  m.loadUserAuthState.mockResolvedValue({ isActive: true, role: "member", tokenVersion: 0 })
  m.projectFindFirst.mockResolvedValue({ id: "p1" })
  m.projectSectionFindFirst.mockResolvedValue(null)
  asRole("po")
  vi.mocked(v1.loadApiActor).mockResolvedValue(API_ACTOR)
  vi.mocked(v1.getPbi).mockResolvedValue({ data: { id: "b1", displayId: 12 } } as never)
})

describe("write guard: token scope ∩ project role", () => {
  it("creates a PBI as PO with the scope, through the UI service with a via:api actor (201)", async () => {
    vi.mocked(backlog.createBacklogItem).mockResolvedValue({ id: "b9" } as never)
    const res = await backlogRoute.POST(send("POST", "/backlog", { userStory: "As a user ..." }), seg({}))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ data: { id: "b9" } })
    expect(backlog.createBacklogItem).toHaveBeenCalledWith("p1", { userStory: "As a user ..." }, API_ACTOR)
    expect(v1.loadApiActor).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", role: "member" }))
  })

  it("403 INSUFFICIENT_SCOPE naming the scope for a read-only token, even as PO", async () => {
    vi.mocked(repo.findTokenByHash).mockResolvedValue(tokenRow({ scopes: '["read"]' }) as never)
    const res = await backlogRoute.POST(send("POST", "/backlog", { userStory: "x" }), seg({}))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: "Insufficient scope", code: "INSUFFICIENT_SCOPE", requiredScope: "backlog:write" })
    expect(backlog.createBacklogItem).not.toHaveBeenCalled()
  })

  it("403 FORBIDDEN for a dev creating a PBI or a sprint despite the scopes", async () => {
    asRole("dev")
    expect((await backlogRoute.POST(send("POST", "/backlog", { userStory: "x" }), seg({}))).status).toBe(403)
    const res = await sprintsRoute.POST(send("POST", "/sprints", { sprintName: "S1", startDate: "2026-11-01", endDate: "2026-11-14" }), seg({}))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: "Forbidden", code: "FORBIDDEN" })
    expect(backlog.createBacklogItem).not.toHaveBeenCalled()
    expect(sprints.createSprint).not.toHaveBeenCalled()
  })

  it("a dev may create and update tasks, comment, write daily scrums and submit Icebox items", async () => {
    asRole("dev")
    vi.mocked(sprintBacklog.createTask).mockResolvedValue({ id: "k1" } as never)
    vi.mocked(sprintBacklog.updateTask).mockResolvedValue({ id: "k1" } as never)
    vi.mocked(comments.createComment).mockResolvedValue({ id: "c1" } as never)
    vi.mocked(daily.createNote).mockResolvedValue({ id: "d1" } as never)
    vi.mocked(icebox.createIceboxItem).mockResolvedValue({ id: "i1" } as never)
    expect((await tasksRoute.POST(send("POST", "/sprints/s1/tasks", { pbItemId: "b1", taskName: "API" }), seg({ sprintId: "s1" }))).status).toBe(201)
    expect((await taskRoute.PATCH(send("PATCH", "/sprints/s1/tasks/k1", { status: "done" }), seg({ sprintId: "s1", taskId: "k1" }))).status).toBe(200)
    expect((await commentsRoute.POST(send("POST", "/comments", { entityType: "pbi", entityId: "b1", body: "MR !12" }), seg({}))).status).toBe(201)
    expect((await iceboxRoute.POST(send("POST", "/icebox", { request: "要望" }), seg({}))).status).toBe(201)
    expect(sprintBacklog.updateTask).toHaveBeenCalledWith("p1", "s1", "k1", { status: "done" }, API_ACTOR)
    // A dev is not a comment moderator.
    expect(comments.createComment).toHaveBeenCalledWith("p1", { entityType: "pbi", entityId: "b1", body: "MR !12" }, API_ACTOR, false)
  })

  it("404 for a project outside the token's restriction, before any scope or body handling", async () => {
    vi.mocked(repo.findTokenByHash).mockResolvedValue(tokenRow({ projectIds: '["p2"]' }) as never)
    const res = await tasksRoute.POST(send("POST", "/sprints/s1/tasks", "{not json"), seg({ sprintId: "s1" }))
    expect(res.status).toBe(404)
    expect(sprintBacklog.createTask).not.toHaveBeenCalled()
  })

  it("404 for a non-member (existence not revealed)", async () => {
    m.memberFindFirst.mockResolvedValue(null)
    expect((await backlogRoute.POST(send("POST", "/backlog", { userStory: "x" }), seg({}))).status).toBe(404)
  })
})

describe("write input", () => {
  it("400 INVALID_JSON for a malformed body", async () => {
    const res = await backlogRoute.POST(send("POST", "/backlog", "{oops"), seg({}))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "Invalid JSON", code: "INVALID_JSON" })
  })

  it("400 VALIDATION from the UI schema (unknown task status)", async () => {
    asRole("dev")
    const res = await taskRoute.PATCH(send("PATCH", "/sprints/s1/tasks/k1", { status: "finished" }), seg({ sprintId: "s1", taskId: "k1" }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe("VALIDATION")
    expect(sprintBacklog.updateTask).not.toHaveBeenCalled()
  })

  it("PBI PATCH resolves PBI-12 to the id and ignores sortOrder (reorder is its own scope)", async () => {
    vi.mocked(backlog.updateBacklogItem).mockResolvedValue({ id: "b1" } as never)
    const res = await pbiRoute.PATCH(send("PATCH", "/backlog/PBI-12", { status: "ready", sortOrder: 1, version: 3 }), seg({ itemId: "PBI-12" }))
    expect(res.status).toBe(200)
    expect(v1.getPbi).toHaveBeenCalledWith("p1", "PBI-12")
    expect(backlog.updateBacklogItem).toHaveBeenCalledWith("p1", "b1", { status: "ready", version: 3 }, API_ACTOR)
  })

  it("service errors keep their status and code (unknown PBI → 404, stale version → 409)", async () => {
    vi.mocked(v1.getPbi).mockRejectedValueOnce(new NotFoundError("PBI not found", {}, "PBI_NOT_FOUND"))
    let res = await pbiRoute.PATCH(send("PATCH", "/backlog/PBI-99", { status: "ready" }), seg({ itemId: "PBI-99" }))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "PBI not found", code: "PBI_NOT_FOUND" })
    vi.mocked(sprintBacklog.updateTask).mockRejectedValueOnce(new ConflictError("Changed", { current: { secret: 1 } }, "VERSION_CONFLICT"))
    res = await taskRoute.PATCH(send("PATCH", "/sprints/s1/tasks/k1", { status: "done", version: 1 }), seg({ sprintId: "s1", taskId: "k1" }))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: "Changed", code: "VERSION_CONFLICT" })
  })

  it("sprint routes delegate (create 201, update 200, add PBIs 201 / 200 when nothing new)", async () => {
    vi.mocked(sprints.createSprint).mockResolvedValue({ id: "s2" } as never)
    vi.mocked(sprints.updateSprint).mockResolvedValue({ id: "s2" } as never)
    const sprint = { sprintName: "S2", startDate: "2026-11-01", endDate: "2026-11-14", selectedPbIds: ["b1"] }
    expect((await sprintsRoute.POST(send("POST", "/sprints", sprint), seg({}))).status).toBe(201)
    expect(sprints.createSprint).toHaveBeenCalledWith("p1", sprint, API_ACTOR)
    expect((await sprintRoute.PATCH(send("PATCH", "/sprints/s2", { sprintGoal: "Ship" }), seg({ sprintId: "s2" }))).status).toBe(200)
    vi.mocked(sprintBacklog.addPbisToSprint).mockResolvedValueOnce({ added: 1 } as never).mockResolvedValueOnce({ added: 0 } as never)
    expect((await sprintPbisRoute.POST(send("POST", "/sprints/s2/pbis", { pbIds: ["b1"] }), seg({ sprintId: "s2" }))).status).toBe(201)
    expect((await sprintPbisRoute.POST(send("POST", "/sprints/s2/pbis", { pbIds: ["b1"] }), seg({ sprintId: "s2" }))).status).toBe(200)
    expect(sprintBacklog.addPbisToSprint).toHaveBeenCalledWith("p1", "s2", ["b1"], API_ACTOR)
  })

  it("daily scrum notes go to the sprint", async () => {
    vi.mocked(daily.createNote).mockResolvedValue({ id: "d1" } as never)
    const note = { date: "2026-11-02", content: "done X" }
    const res = await dailyRoute.POST(send("POST", "/sprints/s1/daily-scrums", note), seg({ sprintId: "s1" }))
    expect(res.status).toBe(201)
    expect(daily.createNote).toHaveBeenCalledWith("p1", "s1", note, API_ACTOR)
  })
})

describe("Idempotency-Key", () => {
  const create = (key: string, body: unknown = { pbItemId: "b1", taskName: "API" }) =>
    tasksRoute.POST(send("POST", "/sprints/s1/tasks", body, { "Idempotency-Key": key }), seg({ sprintId: "s1" }))

  beforeEach(() => vi.mocked(sprintBacklog.createTask).mockResolvedValue({ id: "k1" } as never))

  it("replays the first success instead of creating a duplicate", async () => {
    const first = await create("abc-1")
    const again = await create("abc-1")
    expect(first.status).toBe(201)
    expect(again.status).toBe(201)
    expect(await again.json()).toEqual({ data: { id: "k1" } })
    expect(again.headers.get("Idempotent-Replayed")).toBe("true")
    expect(sprintBacklog.createTask).toHaveBeenCalledTimes(1)
  })

  it("concurrent retries share one creation", async () => {
    const [a, b] = await Promise.all([create("same"), create("same")])
    expect([a.status, b.status]).toEqual([201, 201])
    expect(sprintBacklog.createTask).toHaveBeenCalledTimes(1)
  })

  it("409 when the key is reused with another body; other keys / tokens are independent", async () => {
    await create("k")
    expect((await create("k", { pbItemId: "b2", taskName: "Other" })).status).toBe(409)
    await create("k2")
    vi.mocked(repo.findTokenByHash).mockResolvedValue(tokenRow({ id: "t2" }) as never)
    await create("k")
    expect(sprintBacklog.createTask).toHaveBeenCalledTimes(3)
  })

  it("does not keep failures: a retry after an error runs again", async () => {
    vi.mocked(sprintBacklog.createTask).mockRejectedValueOnce(new NotFoundError("Sprint not found", {}, "SPRINT_NOT_FOUND"))
    expect((await create("retry")).status).toBe(404)
    expect((await create("retry")).status).toBe(201)
    expect(sprintBacklog.createTask).toHaveBeenCalledTimes(2)
  })

  it("400 for a malformed key", async () => {
    expect((await create("has space")).status).toBe(400)
    expect((await create("x".repeat(201))).status).toBe(400)
    expect(sprintBacklog.createTask).not.toHaveBeenCalled()
  })
})

describe("write budget", () => {
  it("429 with Retry-After once the per-token write budget is spent; reads still pass", async () => {
    vi.stubEnv("API_V1_WRITE_RATE_LIMIT_PER_MIN", "1")
    vi.mocked(icebox.createIceboxItem).mockResolvedValue({ id: "i1" } as never)
    expect((await iceboxRoute.POST(send("POST", "/icebox", { request: "a" }), seg({}))).status).toBe(201)
    const res = await iceboxRoute.POST(send("POST", "/icebox", { request: "b" }), seg({}))
    expect(res.status).toBe(429)
    expect(res.headers.get("Retry-After")).toBeTruthy()
    expect(await res.json()).toEqual({ error: "Too many write requests", code: "RATE_LIMITED" })
    vi.mocked(v1.getPbi).mockResolvedValue({ data: { id: "b1" } } as never)
    expect((await pbiRoute.GET(send("GET", "/backlog/b1"), seg({ itemId: "b1" }))).status).toBe(200)
  })
})

describe("reads added for the MCP", () => {
  it("lists a comment thread with the viewer's moderation right", async () => {
    vi.mocked(comments.listComments).mockResolvedValue({ items: [{ id: "c1" }], nextCursor: null } as never)
    const res = await commentsRoute.GET(send("GET", "/comments?entityType=pbi&entityId=b1"), seg({}))
    expect(await res.json()).toEqual({ data: [{ id: "c1" }], nextCursor: null })
    expect(comments.listComments).toHaveBeenCalledWith("p1", expect.objectContaining({ entityType: "pbi", entityId: "b1" }), {
      userId: "u1",
      canModerate: true,
    })
  })
})
