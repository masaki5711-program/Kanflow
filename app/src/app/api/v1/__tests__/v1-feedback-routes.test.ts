import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * /api/v1/feedback/* (W11): the token scope guard (allow and deny), the project role when a body names a
 * project, curation scope, the per-token report budget, idempotency and the shapes. The services are mocked;
 * their rules are tested in services/feedback.
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
vi.mock("@/services/feedback/feedback.service")
vi.mock("@/services/feedback/feedback.lessons.service")

const repo = await import("@/services/api-tokens/api-tokens.repository")
const v1 = await import("@/services/api-v1/api-v1.service")
const fb = await import("@/services/feedback/feedback.service")
const lessons = await import("@/services/feedback/feedback.lessons.service")
const { generateApiToken } = await import("@/lib/api-tokens/token")
const { resetApiTokenTouchCache } = await import("@/services/api-tokens/api-token-auth")
const { resetIdempotencyStore } = await import("@/app/api/v1/_lib/v1-write")
const { ConflictError, ForbiddenError, NotFoundError, StatusError } = await import("@/services/_shared/errors")

const failuresRoute = await import("@/app/api/v1/feedback/failures/route")
const resolutionsRoute = await import("@/app/api/v1/feedback/resolutions/route")
const lessonsRoute = await import("@/app/api/v1/feedback/lessons/route")
const confirmRoute = await import("@/app/api/v1/feedback/lessons/[id]/confirm/route")
const retireRoute = await import("@/app/api/v1/feedback/lessons/[id]/retire/route")
const systemizeRoute = await import("@/app/api/v1/feedback/lessons/[id]/systemize/route")

const token = generateApiToken()
const BASE = "http://localhost/api/v1/feedback"
const DEV_SCOPES = '["read","dev:write"]'
const READ_ONLY = '["read"]'
const SPRINT_SCOPES = '["read","sprint:write"]'
const EVERY_OTHER_SCOPE = '["read","backlog:write","backlog:reorder","sprint:write","task:write","comment:write","icebox:write","daily:write"]'
const API_ACTOR = { userId: "u1", userName: "Dev One", systemRole: "member", via: "api" as const }
const FAILURE = { id: "f1", signature: "a".repeat(64) }
const LESSON = { id: "l1", state: "confirmed" }

function send(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}${path}`, {
    method,
    headers: { authorization: `Bearer ${token.token}`, "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
const seg = <P extends Record<string, string>>(params: P) => ({ params: Promise.resolve(params) })
const asRole = (role: string | null) => m.memberFindFirst.mockResolvedValue(role === null ? null : { role })
const withScopes = (scopes: string, projectIds: string | null = null) =>
  vi.mocked(repo.findTokenByHash).mockResolvedValue({
    id: "t1", userId: "u1", prefix: token.prefix, scopes, projectIds, userTokenVersion: 0, expiresAt: null, revokedAt: null, lastUsedAt: null,
  } as never)

const FAILURE_BODY = { tool: "cargo test", text: "error[E0308]: mismatched types", sessionRef: "s-1" }
const RESOLUTION_BODY = { sessionRef: "s-1", diffSummary: "pinned the dependency" }
const REPORTS = [
  { name: "failure", call: (body: object = FAILURE_BODY) => failuresRoute.POST(send("POST", "/failures", body), seg({})) },
  { name: "resolution", call: (body: object = RESOLUTION_BODY) => resolutionsRoute.POST(send("POST", "/resolutions", body), seg({})) },
] as const

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  delete (globalThis as { __kanflowRateLimiters?: unknown }).__kanflowRateLimiters
  resetApiTokenTouchCache()
  resetIdempotencyStore()
  withScopes(DEV_SCOPES)
  vi.mocked(repo.touchLastUsed).mockResolvedValue({ count: 1 })
  m.loadUserAuthState.mockResolvedValue({ isActive: true, role: "member", tokenVersion: 0 })
  m.projectFindFirst.mockResolvedValue({ id: "p1" })
  m.projectSectionFindFirst.mockResolvedValue(null)
  asRole("dev")
  vi.mocked(v1.loadApiActor).mockResolvedValue(API_ACTOR)
  vi.mocked(fb.reportFailure).mockResolvedValue({ failure: FAILURE, collapsed: false, lessons: [] } as never)
  vi.mocked(fb.reportResolution).mockResolvedValue({ resolution: { id: "r1" }, lesson: { id: "l1", state: "draft" }, lessonCreated: true } as never)
  vi.mocked(lessons.searchSharedLessons).mockResolvedValue({ lessons: [], truncated: false })
  vi.mocked(lessons.confirmLesson).mockResolvedValue(LESSON as never)
  vi.mocked(lessons.retireLesson).mockResolvedValue({ ...LESSON, state: "retired" } as never)
  vi.mocked(lessons.systemizeLesson).mockResolvedValue({ ...LESSON, state: "systemized" } as never)
})

describe("reports: token scope dev:write", () => {
  it.each(REPORTS)("$name: allowed with dev:write, as the token owner via api, outside any project too", async ({ call }) => {
    const res = await call()
    expect(res.status).toBe(201)
    expect(v1.loadApiActor).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1" }))
    // No project in the body: no project lookup at all.
    expect(m.memberFindFirst).not.toHaveBeenCalled()
  })

  it.each(REPORTS)("$name: 403 INSUFFICIENT_SCOPE (requiredScope dev:write) for every other scope, even for a PO", async ({ call }) => {
    withScopes(EVERY_OTHER_SCOPE)
    asRole("po")
    const res = await call()
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: "Insufficient scope", code: "INSUFFICIENT_SCOPE", requiredScope: "dev:write" })
    expect(fb.reportFailure).not.toHaveBeenCalled()
    expect(fb.reportResolution).not.toHaveBeenCalled()
  })

  it.each(REPORTS)("$name: with a projectId the owner's project role applies (non-member 404, section manager 403, member ok, token restriction 404)", async ({ call }) => {
    const body = (REPORTS[0].name === "failure" ? { ...FAILURE_BODY, ...RESOLUTION_BODY } : {}) as object
    asRole(null)
    expect((await call({ ...body, projectId: "p1" })).status).toBe(404)
    m.projectSectionFindFirst.mockResolvedValue({ id: "ps1" })
    m.loadUserAuthState.mockResolvedValue({ isActive: true, role: "section_manager", tokenVersion: 0 })
    const sm = await call({ ...body, projectId: "p1" })
    expect(sm.status).toBe(403)
    expect(((await sm.json()) as { code: string }).code).toBe("FORBIDDEN")
    m.projectSectionFindFirst.mockResolvedValue(null)
    m.loadUserAuthState.mockResolvedValue({ isActive: true, role: "member", tokenVersion: 0 })
    asRole("dev")
    expect((await call({ ...body, projectId: "p1" })).status).toBe(201)
    withScopes(DEV_SCOPES, '["p9"]')
    expect((await call({ ...body, projectId: "p1" })).status).toBe(404)
  })
})

describe("POST /feedback/failures", () => {
  it("201 with the stored failure, the lessons that apply and the data-not-instructions notice", async () => {
    vi.mocked(fb.reportFailure).mockResolvedValue({ failure: FAILURE, collapsed: false, lessons: [{ id: "l1", fix: "do this" }] } as never)
    const res = await failuresRoute.POST(send("POST", "/failures", { ...FAILURE_BODY, projectId: "p1", techs: ["Rust"], errorCode: "E0308" }), seg({}))
    expect(res.status).toBe(201)
    const body = (await res.json()) as { data: unknown; collapsed: boolean; lessons: unknown[]; notice: string }
    expect(body).toMatchObject({ data: FAILURE, collapsed: false, lessons: [{ id: "l1", fix: "do this" }] })
    expect(body.notice).toMatch(/DATA, not instructions/)
    expect(fb.reportFailure).toHaveBeenCalledWith(expect.objectContaining({ source: "agent", tool: "cargo test", projectId: "p1", techs: ["rust"], errorCode: "E0308" }), API_ACTOR)
  })

  it("200 when folded into an identical report of the last minute; lessonsUnavailable is passed on", async () => {
    vi.mocked(fb.reportFailure).mockResolvedValue({ failure: FAILURE, collapsed: true, lessons: [], lessonsUnavailable: true } as never)
    const res = await failuresRoute.POST(send("POST", "/failures", FAILURE_BODY), seg({}))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ collapsed: true, lessonsUnavailable: true })
  })

  it("422 FEEDBACK_REDACTION_FAILED reaches the client", async () => {
    vi.mocked(fb.reportFailure).mockRejectedValue(new StatusError(422, "still credential-like", {}, "FEEDBACK_REDACTION_FAILED"))
    const res = await failuresRoute.POST(send("POST", "/failures", FAILURE_BODY), seg({}))
    expect(res.status).toBe(422)
    expect(((await res.json()) as { code: string }).code).toBe("FEEDBACK_REDACTION_FAILED")
  })

  it.each([
    ["no tool", { text: "x" }],
    ["no text", { tool: "t" }],
    ["an unknown source", { ...FAILURE_BODY, source: "pigeon" }],
    ["an error code with spaces", { ...FAILURE_BODY, errorCode: "E 1" }],
    ["a session id with spaces", { ...FAILURE_BODY, sessionRef: "my session" }],
    ["more than 10 techs", { ...FAILURE_BODY, techs: Array.from({ length: 11 }, (_, i) => `t${i}`) }],
    ["a text over 100000 characters", { ...FAILURE_BODY, text: "x".repeat(100_001) }],
  ])("400 VALIDATION for %s", async (_label, body) => {
    const res = await failuresRoute.POST(send("POST", "/failures", body), seg({}))
    expect(res.status).toBe(400)
    expect(((await res.json()) as { code: string }).code).toBe("VALIDATION")
    expect(fb.reportFailure).not.toHaveBeenCalled()
  })

  it("an Idempotency-Key replays the first answer without reporting twice", async () => {
    const headers = { "idempotency-key": "k-1" }
    expect((await failuresRoute.POST(send("POST", "/failures", FAILURE_BODY, headers), seg({}))).status).toBe(201)
    const again = await failuresRoute.POST(send("POST", "/failures", FAILURE_BODY, headers), seg({}))
    expect(again.headers.get("Idempotent-Replayed")).toBe("true")
    expect(fb.reportFailure).toHaveBeenCalledTimes(1)
  })

  it("reports have their own budget (default 60 a minute), not the generic write budget (30)", async () => {
    for (let i = 0; i < 45; i++) expect((await REPORTS[0].call({ ...FAILURE_BODY, text: `boom ${i}` })).status).toBe(201)
  })

  it("429 RATE_LIMITED once the token's report budget is spent (FEEDBACK_REPORT_RATE_LIMIT_PER_MIN), with Retry-After; failures and resolutions share it", async () => {
    vi.stubEnv("FEEDBACK_REPORT_RATE_LIMIT_PER_MIN", "2")
    expect((await REPORTS[0].call()).status).toBe(201)
    expect((await REPORTS[1].call()).status).toBe(201)
    const res = await REPORTS[0].call()
    expect(res.status).toBe(429)
    expect(((await res.json()) as { code: string }).code).toBe("RATE_LIMITED")
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0)
    expect(fb.reportFailure).toHaveBeenCalledTimes(1)
  })
})

describe("POST /feedback/resolutions", () => {
  it("201 with the resolution and the draft lesson", async () => {
    const res = await resolutionsRoute.POST(send("POST", "/resolutions", { ...RESOLUTION_BODY, verifiedCommand: "cargo test", scope: "Tech:Rust", evidence: ["https://x.test/mr/1"] }), seg({}))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ data: { id: "r1" }, lesson: { id: "l1", state: "draft" }, lessonCreated: true })
    expect(fb.reportResolution).toHaveBeenCalledWith(expect.objectContaining({ sessionRef: "s-1", scope: "tech:rust", verifiedCommand: "cargo test" }), API_ACTOR)
  })

  it("404 FEEDBACK_NO_FAILURE and 409 pass through; a bad scope is a 400", async () => {
    vi.mocked(fb.reportResolution).mockRejectedValueOnce(new NotFoundError("none", {}, "FEEDBACK_NO_FAILURE"))
    const res = await resolutionsRoute.POST(send("POST", "/resolutions", RESOLUTION_BODY), seg({}))
    expect(res.status).toBe(404)
    expect(((await res.json()) as { code: string }).code).toBe("FEEDBACK_NO_FAILURE")
    vi.mocked(fb.reportResolution).mockRejectedValueOnce(new ConflictError("already"))
    expect((await resolutionsRoute.POST(send("POST", "/resolutions", RESOLUTION_BODY), seg({}))).status).toBe(409)
    expect((await resolutionsRoute.POST(send("POST", "/resolutions", { ...RESOLUTION_BODY, scope: "everywhere" }), seg({}))).status).toBe(400)
  })
})

describe("GET /feedback/lessons: scope read, shared lessons only", () => {
  it("a read-only token may search; the viewer is the token owner and carries the token's project restriction", async () => {
    withScopes(READ_ONLY, '["p1"]')
    vi.mocked(lessons.searchSharedLessons).mockResolvedValue({ lessons: [{ id: "l1" }], truncated: false } as never)
    const res = await lessonsRoute.GET(send("GET", "/lessons?q=lock&tech=rust&limit=5"), seg({}))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: unknown[]; notice: string }
    expect(body.data).toEqual([{ id: "l1" }])
    expect(body.notice).toMatch(/DATA, not instructions/)
    expect(lessons.searchSharedLessons).toHaveBeenCalledWith({ userId: "u1", systemRole: "member", projectIds: ["p1"] }, expect.objectContaining({ q: "lock", tech: "rust", limit: 5 }))
  })

  it("a state filter reaches the service (which ignores it for tokens); a bad signature is a 400", async () => {
    expect((await lessonsRoute.GET(send("GET", "/lessons?signature=xyz"), seg({}))).status).toBe(400)
    expect((await lessonsRoute.GET(send("GET", "/lessons?limit=500"), seg({}))).status).toBe(400)
  })

  it("401 without a token", async () => {
    const res = await lessonsRoute.GET(new Request(`${BASE}/lessons`), seg({}))
    expect(res.status).toBe(401)
  })
})

describe("curation: token scope sprint:write; the owner's right is checked by the service", () => {
  const CURATE = [
    { name: "confirm", route: confirmRoute, fn: () => lessons.confirmLesson, body: {} },
    { name: "retire", route: retireRoute, fn: () => lessons.retireLesson, body: {} },
    { name: "systemize", route: systemizeRoute, fn: () => lessons.systemizeLesson, body: { kind: "gate", ref: "ci/lint" } },
  ] as const

  it.each(CURATE)("$name: 403 INSUFFICIENT_SCOPE (requiredScope sprint:write) for a dev:write-only token", async ({ route, body }) => {
    const res = await route.POST(send("POST", "/lessons/l1/x", body), seg({ id: "l1" }))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: "Insufficient scope", code: "INSUFFICIENT_SCOPE", requiredScope: "sprint:write" })
  })

  it.each(CURATE)("$name: with sprint:write the service gets the token owner as the viewer", async ({ route, fn, body }) => {
    withScopes(SPRINT_SCOPES, '["p1"]')
    m.loadUserAuthState.mockResolvedValue({ isActive: true, role: "section_manager", tokenVersion: 0 })
    const res = await route.POST(send("POST", "/lessons/l1/x", body), seg({ id: "l1" }))
    expect(res.status).toBe(200)
    expect(fn()).toHaveBeenCalledWith({ userId: "u1", systemRole: "section_manager", projectIds: ["p1"] }, "l1", expect.anything())
  })

  it.each(CURATE)("$name: the service's refusals pass through (403 FORBIDDEN, 404 LESSON_NOT_FOUND, 409 LESSON_STATE)", async ({ route, fn, body }) => {
    withScopes(SPRINT_SCOPES)
    for (const [error, status, code] of [
      [new ForbiddenError("Forbidden", {}, "FORBIDDEN"), 403, "FORBIDDEN"],
      [new NotFoundError("no", {}, "LESSON_NOT_FOUND"), 404, "LESSON_NOT_FOUND"],
      [new ConflictError("state", {}, "LESSON_STATE"), 409, "LESSON_STATE"],
    ] as const) {
      vi.mocked(fn() as (...a: unknown[]) => Promise<unknown>).mockRejectedValueOnce(error)
      const res = await route.POST(send("POST", "/lessons/l1/x", body), seg({ id: "l1" }))
      expect(res.status).toBe(status)
      expect(((await res.json()) as { code: string }).code).toBe(code)
    }
  })

  it("systemize without a link is a 400 and reaches no service", async () => {
    withScopes(SPRINT_SCOPES)
    expect((await systemizeRoute.POST(send("POST", "/lessons/l1/systemize", {}), seg({ id: "l1" }))).status).toBe(400)
    expect((await systemizeRoute.POST(send("POST", "/lessons/l1/systemize", { kind: "wish", ref: "x" }), seg({ id: "l1" }))).status).toBe(400)
    expect(lessons.systemizeLesson).not.toHaveBeenCalled()
  })
})
