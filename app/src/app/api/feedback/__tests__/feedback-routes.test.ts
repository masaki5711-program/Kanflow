import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * /api/feedback/* — the session twin of the feedback API for the Lessons screen (W11): a signed-in user is the
 * viewer; the services decide what that user may see and curate (tested in services/feedback).
 */

const authMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/logger", () => {
  const noop = { debug() {}, info() {}, warn() {}, error() {}, child: () => noop }
  return { logger: noop }
})
vi.mock("@/services/feedback/feedback.lessons.service")
vi.mock("@/services/feedback/feedback.metrics.service")

const lessons = await import("@/services/feedback/feedback.lessons.service")
const metrics = await import("@/services/feedback/feedback.metrics.service")
const { ConflictError, ForbiddenError, NotFoundError } = await import("@/services/_shared/errors")
const listRoute = await import("@/app/api/feedback/lessons/route")
const detailRoute = await import("@/app/api/feedback/lessons/[id]/route")
const confirmRoute = await import("@/app/api/feedback/lessons/[id]/confirm/route")
const retireRoute = await import("@/app/api/feedback/lessons/[id]/retire/route")
const systemizeRoute = await import("@/app/api/feedback/lessons/[id]/systemize/route")
const metricsRoute = await import("@/app/api/feedback/metrics/route")

const VIEWER = { userId: "u1", systemRole: "section_manager", projectIds: null }
const seg = { params: Promise.resolve({ id: "l1" }) }
const get = (path: string) => new Request(`http://localhost/api/feedback${path}`)
const post = (path: string, body?: unknown, raw?: string) =>
  new Request(`http://localhost/api/feedback${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) })

beforeEach(() => {
  vi.clearAllMocks()
  authMock.mockResolvedValue({ user: { id: "u1", name: "Alice", role: "section_manager" } })
  vi.mocked(lessons.listLessonsForScreen).mockResolvedValue({ lessons: [], truncated: false, canCurate: true, curatable: {} })
  vi.mocked(lessons.getLessonDetail).mockResolvedValue({ lesson: { id: "l1" }, canCurate: true, failures: [] } as never)
  vi.mocked(lessons.confirmLesson).mockResolvedValue({ id: "l1", state: "confirmed" } as never)
  vi.mocked(lessons.retireLesson).mockResolvedValue({ id: "l1", state: "retired" } as never)
  vi.mocked(lessons.systemizeLesson).mockResolvedValue({ id: "l1", state: "systemized" } as never)
  vi.mocked(metrics.getFeedbackMetrics).mockResolvedValue(null)
})

describe("authentication: every route needs a session", () => {
  it("401 without one, and no service is reached", async () => {
    authMock.mockResolvedValue(null)
    const calls = [
      listRoute.GET(get("/lessons")),
      detailRoute.GET(get("/lessons/l1"), seg),
      confirmRoute.POST(post("/lessons/l1/confirm", {}), seg),
      retireRoute.POST(post("/lessons/l1/retire", {}), seg),
      systemizeRoute.POST(post("/lessons/l1/systemize", { kind: "pbi", ref: "PBI-1" }), seg),
      metricsRoute.GET(),
    ]
    for (const res of await Promise.all(calls)) expect(res.status).toBe(401)
    expect(lessons.listLessonsForScreen).not.toHaveBeenCalled()
    expect(lessons.confirmLesson).not.toHaveBeenCalled()
    expect(metrics.getFeedbackMetrics).not.toHaveBeenCalled()
  })
})

describe("reads", () => {
  it("the list is for the session user (no token restriction) with the query parsed", async () => {
    const res = await listRoute.GET(get("/lessons?q=lock&state=draft&limit=10"))
    expect(res.status).toBe(200)
    expect(lessons.listLessonsForScreen).toHaveBeenCalledWith(VIEWER, expect.objectContaining({ q: "lock", state: "draft", limit: 10 }))
    expect((await listRoute.GET(get("/lessons?state=nope"))).status).toBe(400)
  })

  it("detail and metrics", async () => {
    expect(await (await detailRoute.GET(get("/lessons/l1"), seg)).json()).toMatchObject({ lesson: { id: "l1" }, canCurate: true })
    expect(lessons.getLessonDetail).toHaveBeenCalledWith(VIEWER, "l1")
    expect(await (await metricsRoute.GET()).json()).toEqual({ metrics: null })
  })

  it("a lesson the service hides is a 404 with its code", async () => {
    vi.mocked(lessons.getLessonDetail).mockRejectedValue(new NotFoundError("no", {}, "LESSON_NOT_FOUND"))
    const res = await detailRoute.GET(get("/lessons/l1"), seg)
    expect(res.status).toBe(404)
    expect(((await res.json()) as { code: string }).code).toBe("LESSON_NOT_FOUND")
  })
})

describe("curation", () => {
  it("confirm / retire / systemize call the service as the session user and answer { lesson }", async () => {
    expect(await (await confirmRoute.POST(post("/lessons/l1/confirm", { fix: "restart" }), seg)).json()).toEqual({ lesson: { id: "l1", state: "confirmed" } })
    expect(lessons.confirmLesson).toHaveBeenCalledWith(VIEWER, "l1", { fix: "restart" })
    expect((await retireRoute.POST(post("/lessons/l1/retire"), seg)).status).toBe(200)
    expect(lessons.retireLesson).toHaveBeenCalledWith(VIEWER, "l1", {})
    expect((await systemizeRoute.POST(post("/lessons/l1/systemize", { kind: "test", ref: "tests/x.rs" }), seg)).status).toBe(200)
    expect(lessons.systemizeLesson).toHaveBeenCalledWith(VIEWER, "l1", { kind: "test", ref: "tests/x.rs" })
  })

  it("the service's refusals keep their status and code (403 FORBIDDEN, 409 LESSON_STATE)", async () => {
    vi.mocked(lessons.confirmLesson).mockRejectedValueOnce(new ForbiddenError("Forbidden", {}, "FORBIDDEN"))
    const denied = await confirmRoute.POST(post("/lessons/l1/confirm", {}), seg)
    expect([denied.status, ((await denied.json()) as { code: string }).code]).toEqual([403, "FORBIDDEN"])
    vi.mocked(lessons.systemizeLesson).mockRejectedValueOnce(new ConflictError("state", {}, "LESSON_STATE"))
    const conflict = await systemizeRoute.POST(post("/lessons/l1/systemize", { kind: "pbi", ref: "PBI-1" }), seg)
    expect([conflict.status, ((await conflict.json()) as { code: string }).code]).toEqual([409, "LESSON_STATE"])
  })

  it("bad input is a 400 and reaches no service: no link, unknown kind, malformed JSON", async () => {
    expect((await systemizeRoute.POST(post("/lessons/l1/systemize", {}), seg)).status).toBe(400)
    expect((await systemizeRoute.POST(post("/lessons/l1/systemize", { kind: "wish", ref: "x" }), seg)).status).toBe(400)
    const bad = await confirmRoute.POST(post("/lessons/l1/confirm", undefined, "{nope"), seg)
    expect(bad.status).toBe(400)
    expect(((await bad.json()) as { code: string }).code).toBe("INVALID_JSON")
    expect(lessons.systemizeLesson).not.toHaveBeenCalled()
    expect(lessons.confirmLesson).not.toHaveBeenCalled()
  })
})
