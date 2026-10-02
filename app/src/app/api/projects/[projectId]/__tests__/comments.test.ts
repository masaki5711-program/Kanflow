import { beforeEach, describe, expect, it, vi } from "vitest"
import { ACTOR, PROJECT_ID, asRole, ctx, read, req, signedOut } from "./route-harness"

vi.mock("@/lib/auth", async () => (await import("./route-harness")).authModule)
vi.mock("@/lib/prisma", async () => (await import("./route-harness")).prismaModule)
vi.mock("@/lib/logger", async () => (await import("./route-harness")).loggerModule)
vi.mock("@/services/comments/comments.service", () => ({
  listComments: vi.fn(),
  createComment: vi.fn(),
  updateComment: vi.fn(),
  deleteComment: vi.fn(),
  getCommentCounts: vi.fn(),
}))

const svc = await import("@/services/comments/comments.service")
const list = await import("@/app/api/projects/[projectId]/comments/route")
const one = await import("@/app/api/projects/[projectId]/comments/[commentId]/route")
const counts = await import("@/app/api/projects/[projectId]/comments/counts/route")
const { ForbiddenError, NotFoundError } = await import("@/services/_shared")

const url = (path: string) => `http://localhost/api/projects/${PROJECT_ID}/comments${path}`
const get = (path: string) => new Request(url(path))
const PAGE = { items: [{ id: "c1" }], nextCursor: null }
const cCtx = () => ctx({ commentId: "c1" })

beforeEach(() => {
  for (const fn of Object.values(svc)) vi.mocked(fn as () => unknown).mockReset()
  vi.mocked(svc.listComments).mockResolvedValue(PAGE as never)
})

describe("GET /comments", () => {
  it("lists a thread with defaults; viewer carries moderation right", async () => {
    asRole("dev")
    expect(await read(await list.GET(get("?entityType=pbi&entityId=b1"), ctx()))).toEqual({ status: 200, body: PAGE })
    expect(svc.listComments).toHaveBeenCalledWith(
      PROJECT_ID,
      { entityType: "pbi", entityId: "b1", limit: 50 },
      { userId: "u1", canModerate: false },
    )
    asRole("po")
    await list.GET(get("?entityType=icebox&entityId=i1&limit=5"), ctx())
    expect(svc.listComments).toHaveBeenLastCalledWith(
      PROJECT_ID,
      { entityType: "icebox", entityId: "i1", limit: 5 },
      { userId: "u1", canModerate: true },
    )
  })

  it("section managers can read", async () => {
    asRole(null)
    const { sectionFindFirst } = await import("./route-harness")
    const { authMock } = await import("./route-harness")
    authMock.mockResolvedValue({ user: { id: "u1", name: "Alice", role: "section_manager" } })
    sectionFindFirst.mockResolvedValue({ id: "ps" })
    expect((await list.GET(get("?entityType=pbi&entityId=b1"), ctx())).status).toBe(200)
  })

  it.each(["", "?entityType=pbi", "?entityType=goal&entityId=g", "?entityType=pbi&entityId=b1&limit=101"])("400 for %s", async (q) => {
    asRole("dev")
    expect((await list.GET(get(q), ctx())).status).toBe(400)
    expect(svc.listComments).not.toHaveBeenCalled()
  })

  it("401 signed out, 404 non-member, 404 from the service", async () => {
    signedOut()
    expect((await list.GET(get("?entityType=pbi&entityId=b1"), ctx())).status).toBe(401)
    asRole(null)
    expect((await list.GET(get("?entityType=pbi&entityId=b1"), ctx())).status).toBe(404)
    asRole("dev")
    vi.mocked(svc.listComments).mockRejectedValue(new NotFoundError("Comment target not found"))
    expect((await list.GET(get("?entityType=pbi&entityId=b1"), ctx())).status).toBe(404)
  })
})

describe("POST /comments", () => {
  const body = { entityType: "sprint_task", entityId: "t1", body: "  hi @[Taro Yamada]  " }

  it("creates as a dev (201) with the trimmed body", async () => {
    asRole("dev")
    vi.mocked(svc.createComment).mockResolvedValue({ id: "c1" } as never)
    expect(await read(await list.POST(req("POST", body), ctx()))).toEqual({ status: 201, body: { id: "c1" } })
    expect(svc.createComment).toHaveBeenCalledWith(
      PROJECT_ID,
      { entityType: "sprint_task", entityId: "t1", body: "hi @[Taro Yamada]" },
      ACTOR,
      false,
    )
  })

  it("section managers (not members) cannot comment", async () => {
    asRole(null, "section_manager")
    const { sectionFindFirst } = await import("./route-harness")
    sectionFindFirst.mockResolvedValue({ id: "ps" })
    expect((await list.POST(req("POST", body), ctx())).status).toBe(403)
  })

  it.each([
    { ...body, body: "   " },
    { ...body, body: "x".repeat(10_001) },
    { ...body, entityType: "sprint" },
    { entityType: "pbi", body: "x" },
  ])("400 for invalid input %#", async (input) => {
    asRole("dev")
    expect((await list.POST(req("POST", input), ctx())).status).toBe(400)
    expect(svc.createComment).not.toHaveBeenCalled()
  })

  it("accepts exactly 10000 chars; 400 on malformed JSON; 500 on failure", async () => {
    asRole("dev")
    vi.mocked(svc.createComment).mockResolvedValue({ id: "c1" } as never)
    expect((await list.POST(req("POST", { ...body, body: "x".repeat(10_000) }), ctx())).status).toBe(201)
    expect((await list.POST(req("POST", "{"), ctx())).status).toBe(400)
    vi.mocked(svc.createComment).mockRejectedValue(new Error("db"))
    expect(await read(await list.POST(req("POST", body), ctx()))).toEqual({
      status: 500,
      body: { error: "作成に失敗しました", code: "INTERNAL" },
    })
  })
})

describe("PATCH/DELETE /comments/:commentId", () => {
  it("edits with the moderation flag", async () => {
    asRole("sm")
    vi.mocked(svc.updateComment).mockResolvedValue({ id: "c1" } as never)
    expect((await one.PATCH(req("PATCH", { body: "new" }), cCtx())).status).toBe(200)
    expect(svc.updateComment).toHaveBeenCalledWith(PROJECT_ID, "c1", { body: "new" }, ACTOR, false)
  })

  it("maps 403 / 404 from the service; 400 for an empty body", async () => {
    asRole("dev")
    vi.mocked(svc.updateComment).mockRejectedValueOnce(new ForbiddenError("Only the author can edit this comment"))
    expect((await one.PATCH(req("PATCH", { body: "x" }), cCtx())).status).toBe(403)
    vi.mocked(svc.updateComment).mockRejectedValueOnce(new NotFoundError("Comment not found"))
    expect((await one.PATCH(req("PATCH", { body: "x" }), cCtx())).status).toBe(404)
    expect((await one.PATCH(req("PATCH", { body: "" }), cCtx())).status).toBe(400)
    vi.mocked(svc.updateComment).mockRejectedValueOnce(new Error("db"))
    expect((await one.PATCH(req("PATCH", { body: "x" }), cCtx())).status).toBe(500)
  })

  it("deletes; PO and admin moderate", async () => {
    asRole("po")
    expect(await read(await one.DELETE(req("DELETE"), cCtx()))).toEqual({ status: 200, body: { success: true } })
    expect(svc.deleteComment).toHaveBeenCalledWith(PROJECT_ID, "c1", ACTOR, true)
    asRole("dev")
    await one.DELETE(req("DELETE"), cCtx())
    expect(svc.deleteComment).toHaveBeenLastCalledWith(PROJECT_ID, "c1", ACTOR, false)
    asRole(null, "admin")
    await one.DELETE(req("DELETE"), cCtx())
    expect(svc.deleteComment).toHaveBeenLastCalledWith(PROJECT_ID, "c1", { ...ACTOR, systemRole: "admin" }, true)
  })

  it("maps delete failures", async () => {
    asRole("dev")
    vi.mocked(svc.deleteComment).mockRejectedValueOnce(new ForbiddenError("x"))
    expect((await one.DELETE(req("DELETE"), cCtx())).status).toBe(403)
    vi.mocked(svc.deleteComment).mockRejectedValueOnce(new Error("db"))
    expect((await one.DELETE(req("DELETE"), cCtx())).status).toBe(500)
    asRole(null)
    expect((await one.DELETE(req("DELETE"), cCtx())).status).toBe(404)
  })
})

describe("GET /comments/counts", () => {
  it("parses de-duplicated ids", async () => {
    asRole("dev")
    vi.mocked(svc.getCommentCounts).mockResolvedValue({ counts: { a: 1, b: 0 }, unread: { a: 1 } })
    expect(await read(await counts.GET(get("/counts?entityType=pbi&ids=a,b,,a"), ctx()))).toEqual({
      status: 200,
      body: { counts: { a: 1, b: 0 }, unread: { a: 1 } },
    })
    expect(svc.getCommentCounts).toHaveBeenCalledWith(PROJECT_ID, { entityType: "pbi", ids: ["a", "b"] }, expect.any(String))
  })

  it("400 without ids, with too many ids or a bad type; 500 on failure", async () => {
    asRole("dev")
    expect((await counts.GET(get("/counts?entityType=pbi"), ctx())).status).toBe(400)
    expect((await counts.GET(get("/counts?entityType=pbi&ids=,"), ctx())).status).toBe(400)
    const many = Array.from({ length: 201 }, (_, i) => `id${i}`).join(",")
    expect((await counts.GET(get(`/counts?entityType=pbi&ids=${many}`), ctx())).status).toBe(400)
    expect((await counts.GET(get("/counts?entityType=user&ids=a"), ctx())).status).toBe(400)
    vi.mocked(svc.getCommentCounts).mockRejectedValue(new Error("db"))
    expect((await counts.GET(get("/counts?entityType=pbi&ids=a"), ctx())).status).toBe(500)
  })
})
