import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Confidential PBIs (D-5) through the REAL /api/v1 route handlers: token auth, project actor, the
 * route, the v1 operation, the repository filter and the masking helpers run over the in-memory Prisma
 * stand-in (services/api-v1/__tests__/confidential-fixture.ts). Only the write services are mocked.
 * Allow AND deny; the enumeration of all routes lives in confidential-enforcement.test.ts.
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
vi.mock("@/services/acceptance-criteria/acceptance-criteria.service")
vi.mock("@/services/comments/comments.service")
vi.mock("@/services/sprint-backlog/sprint-backlog.service")
vi.mock("@/services/dev-work/dev-work.service")
vi.mock("@/services/backlog/backlog.service")

const repo = await import("@/services/api-tokens/api-tokens.repository")
const acService = await import("@/services/acceptance-criteria/acceptance-criteria.service")
const comments = await import("@/services/comments/comments.service")
const sprintBacklog = await import("@/services/sprint-backlog/sprint-backlog.service")
const devWork = await import("@/services/dev-work/dev-work.service")
const backlog = await import("@/services/backlog/backlog.service")
const { leaksSecret } = await import("@/services/api-v1/__tests__/confidential-fixture")
const { NO_SUCH_ID } = await import("@/services/api-v1/api-v1.confidential")
const { generateApiToken } = await import("@/lib/api-tokens/token")
const { resetApiTokenTouchCache } = await import("@/services/api-tokens/api-token-auth")
const { resetIdempotencyStore } = await import("@/app/api/v1/_lib/v1-write")
const backlogRoute = await import("@/app/api/v1/projects/[projectId]/backlog/route")
const pbiRoute = await import("@/app/api/v1/projects/[projectId]/backlog/[itemId]/route")
const acRoute = await import("@/app/api/v1/projects/[projectId]/backlog/[itemId]/acceptance-criteria/route")
const tasksRoute = await import("@/app/api/v1/projects/[projectId]/sprints/[sprintId]/tasks/route")
const taskRoute = await import("@/app/api/v1/projects/[projectId]/sprints/[sprintId]/tasks/[taskId]/route")
const releasesRoute = await import("@/app/api/v1/projects/[projectId]/releases/route")
const activityRoute = await import("@/app/api/v1/projects/[projectId]/activity/route")
const commentsRoute = await import("@/app/api/v1/projects/[projectId]/comments/route")
const claimsRoute = await import("@/app/api/v1/projects/[projectId]/dev/claims/route")

const token = generateApiToken()
const BASE = "http://localhost/api/v1/projects/p1"
const SCOPES = '["read","backlog:write","task:write","comment:write","dev:write"]'

function send(method: string, path: string, body?: unknown): Request {
  return new Request(`${BASE}${path}`, {
    method,
    headers: { authorization: `Bearer ${token.token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
const seg = <P extends Record<string, string>>(params: P) => ({ params: Promise.resolve({ projectId: "p1", ...params }) })

async function answer(res: Response) {
  return { status: res.status, body: (await res.json()) as { data?: Array<{ id: string }> } & Record<string, unknown> }
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
  m.memberFindFirst.mockResolvedValue({ role: "po" })
  m.userFindUnique.mockResolvedValue({ name: "Dev One" })
  vi.mocked(comments.listComments).mockResolvedValue({ items: [], nextCursor: null } as never)
  vi.mocked(acService.listAcceptanceCriteria).mockResolvedValue({ data: [] } as never)
})

describe("direct get", () => {
  it("allow: a normal PBI by id, number and PBI-number", async () => {
    for (const itemId of ["pbA", "1", "PBI-1"]) {
      const r = await answer(await pbiRoute.GET(send("GET", `/backlog/${itemId}`), seg({ itemId })))
      expect(r.status).toBe(200)
      expect(r.body.data).toMatchObject({ id: "pbA" })
    }
  })

  it("deny: the confidential PBI answers 404 PBI_NOT_FOUND, byte for byte what a missing PBI answers", async () => {
    const missing = await answer(await pbiRoute.GET(send("GET", "/backlog/nope"), seg({ itemId: "nope" })))
    expect(missing).toEqual({ status: 404, body: { error: "PBI not found", code: "PBI_NOT_FOUND" } })
    for (const itemId of ["pbC", "2", "PBI-2"]) {
      expect(await answer(await pbiRoute.GET(send("GET", `/backlog/${itemId}`), seg({ itemId })))).toEqual(missing)
    }
  })

  it("deny: the PBI's acceptance criteria are 'missing' too (the service gets a missing id)", async () => {
    await acRoute.GET(send("GET", "/backlog/pbC/acceptance-criteria"), seg({ itemId: "pbC" }))
    await acRoute.GET(send("GET", "/backlog/pbA/acceptance-criteria"), seg({ itemId: "pbA" }))
    expect(vi.mocked(acService.listAcceptanceCriteria).mock.calls.map((c) => c[1])).toEqual([NO_SUCH_ID, "pbA"])
  })
})

describe("lists omit confidential PBIs and everything under them", () => {
  it("backlog", async () => {
    const r = await answer(await backlogRoute.GET(send("GET", "/backlog"), seg({})))
    expect(r.body.data?.map((p) => p.id)).toEqual(["pbA"])
    expect(leaksSecret(r.body)).toBe(false)
  })

  it("sprint tasks", async () => {
    const r = await answer(await tasksRoute.GET(send("GET", "/sprints/s1/tasks"), seg({ sprintId: "s1" })))
    expect(r.body.data?.map((t) => t.id)).toEqual(["tA"])
    expect(leaksSecret(r.body)).toBe(false)
  })

  it("releases", async () => {
    const r = await answer(await releasesRoute.GET(send("GET", "/releases"), seg({})))
    expect(r.body.data?.map((x) => x.id).sort()).toEqual(["rA", "rN"])
    expect(leaksSecret(r.body)).toBe(false)
  })

  it("activity", async () => {
    const r = await answer(await activityRoute.GET(send("GET", "/activity"), seg({})))
    expect(r.body.data?.map((a) => a.id).sort()).toEqual(["a1", "a3", "a5", "a7"])
    expect(leaksSecret(r.body)).toBe(false)
  })

  it("claims (the service result is filtered)", async () => {
    vi.mocked(devWork.listClaims).mockResolvedValue({
      data: [{ id: "c1", pbi: { id: "pbA", title: "public story" } }, { id: "c2", pbi: { id: "pbC", title: "SECRET story" } }],
      staleAfterHours: 4,
    } as never)
    const r = await answer(await claimsRoute.GET(send("GET", "/dev/claims"), seg({})))
    expect(r.body.data?.map((c) => c.id)).toEqual(["c1"])
    expect(leaksSecret(r.body)).toBe(false)
  })
})

describe("writes that name a confidential PBI, task or thread are handed a missing id", () => {
  it("comments on the PBI and on its task", async () => {
    vi.mocked(comments.createComment).mockResolvedValue({ id: "c" } as never)
    await commentsRoute.POST(send("POST", "/comments", { entityType: "pbi", entityId: "pbC", body: "x" }), seg({}))
    await commentsRoute.POST(send("POST", "/comments", { entityType: "sprint_task", entityId: "tC", body: "x" }), seg({}))
    await commentsRoute.POST(send("POST", "/comments", { entityType: "pbi", entityId: "pbA", body: "x" }), seg({}))
    expect(vi.mocked(comments.createComment).mock.calls.map((c) => c[1].entityId)).toEqual([NO_SUCH_ID, NO_SUCH_ID, "pbA"])
  })

  it("reading the PBI's thread", async () => {
    await commentsRoute.GET(send("GET", "/comments?entityType=pbi&entityId=pbC"), seg({}))
    expect(vi.mocked(comments.listComments).mock.calls[0]?.[1].entityId).toBe(NO_SUCH_ID)
  })

  it("updating the task and creating a task under the PBI", async () => {
    vi.mocked(sprintBacklog.updateTask).mockResolvedValue({ id: "tC" } as never)
    vi.mocked(sprintBacklog.createTask).mockResolvedValue({ id: "t9" } as never)
    await taskRoute.PATCH(send("PATCH", "/sprints/s1/tasks/tC", { status: "done" }), seg({ sprintId: "s1", taskId: "tC" }))
    await tasksRoute.POST(send("POST", "/sprints/s1/tasks", { pbItemId: "pbC", taskName: "x" }), seg({ sprintId: "s1" }))
    expect(vi.mocked(sprintBacklog.updateTask).mock.calls[0]?.[2]).toBe(NO_SUCH_ID)
    expect(vi.mocked(sprintBacklog.createTask).mock.calls[0]?.[2].pbItemId).toBe(NO_SUCH_ID)
  })

  it("a token cannot flip the flag: PATCH drops `confidential` before the service", async () => {
    vi.mocked(backlog.updateBacklogItem).mockResolvedValue({ id: "pbA" } as never)
    const r = await pbiRoute.PATCH(send("PATCH", "/backlog/pbA", { confidential: true, poNote: "n" }), seg({ itemId: "pbA" }))
    expect(r.status).toBe(200)
    expect(vi.mocked(backlog.updateBacklogItem).mock.calls[0]?.[2]).toEqual({ poNote: "n" })
  })
})
