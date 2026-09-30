import { beforeEach, describe, expect, it, vi } from "vitest"
import { ACTOR, PROJECT_ID, asRole, ctx, read, req } from "./route-harness"

vi.mock("@/lib/auth", async () => (await import("./route-harness")).authModule)
vi.mock("@/lib/prisma", async () => (await import("./route-harness")).prismaModule)
vi.mock("@/lib/logger", async () => (await import("./route-harness")).loggerModule)
vi.mock("@/services/backlog/backlog.service", () => ({
  listBacklog: vi.fn(),
  createBacklogItem: vi.fn(),
  getBacklogItem: vi.fn(),
  updateBacklogItem: vi.fn(),
  deleteBacklogItem: vi.fn(),
  reorderBacklog: vi.fn(),
}))

const svc = await import("@/services/backlog/backlog.service")
const list = await import("@/app/api/projects/[projectId]/backlog/route")
const item = await import("@/app/api/projects/[projectId]/backlog/[itemId]/route")
const reorder = await import("@/app/api/projects/[projectId]/backlog/reorder/route")
const { ConflictError, NotFoundError, ValidationError } = await import("@/services/_shared")

const itemCtx = () => ctx({ itemId: "pbi-1" })

beforeEach(() => {
  for (const fn of Object.values(svc)) vi.mocked(fn as () => unknown).mockReset()
})

describe("GET/POST /backlog", () => {
  it("lists the backlog for any member", async () => {
    asRole("dev")
    vi.mocked(svc.listBacklog).mockResolvedValue([{ id: "a" }] as never)
    expect(await read(await list.GET(req("GET"), ctx()))).toEqual({ status: 200, body: [{ id: "a" }] })
    expect(svc.listBacklog).toHaveBeenCalledWith(PROJECT_ID)
  })

  it("passes a valid ?status= filter to the service", async () => {
    asRole("dev")
    vi.mocked(svc.listBacklog).mockResolvedValue({ readyItems: [] } as never)
    const res = await list.GET(new Request(`http://localhost/api/projects/${PROJECT_ID}/backlog?status=ready`), ctx())
    expect(res.status).toBe(200)
    expect(svc.listBacklog).toHaveBeenCalledWith(PROJECT_ID, { status: "ready" })
  })

  it("rejects an unknown ?status= with 400 without querying", async () => {
    asRole("dev")
    const res = await list.GET(new Request(`http://localhost/api/projects/${PROJECT_ID}/backlog?status=bogus`), ctx())
    expect(res.status).toBe(400)
    expect(svc.listBacklog).not.toHaveBeenCalled()
  })

  it("returns 500 when listing fails", async () => {
    asRole("dev")
    vi.mocked(svc.listBacklog).mockRejectedValue(new Error("x"))
    expect((await list.GET(req("GET"), ctx())).status).toBe(500)
  })

  it("creates a PBI as SM with 201 and the session actor", async () => {
    asRole("sm")
    vi.mocked(svc.createBacklogItem).mockResolvedValue({ id: "new" } as never)
    const res = await read(await list.POST(req("POST", { userStory: "As a user", workloadScore: 3 }), ctx()))
    expect(res).toEqual({ status: 201, body: { id: "new" } })
    expect(svc.createBacklogItem).toHaveBeenCalledWith(PROJECT_ID, { userStory: "As a user", workloadScore: 3 }, ACTOR)
  })

  it("refuses creation by a dev (403)", async () => {
    asRole("dev")
    expect((await list.POST(req("POST", { userStory: "x" }), ctx())).status).toBe(403)
    expect(svc.createBacklogItem).not.toHaveBeenCalled()
  })

  it("rejects invalid payloads with 400 (negative score, bad status)", async () => {
    asRole("po")
    expect((await list.POST(req("POST", { workloadScore: -1 }), ctx())).status).toBe(400)
    expect((await list.POST(req("POST", { status: "done" }), ctx())).status).toBe(400)
    expect(svc.createBacklogItem).not.toHaveBeenCalled()
  })

  it("surfaces business validation errors from the service", async () => {
    asRole("po")
    vi.mocked(svc.createBacklogItem).mockRejectedValue(new ValidationError("bad goal"))
    expect(await read(await list.POST(req("POST", {}), ctx()))).toEqual({ status: 400, body: { error: "bad goal", code: "VALIDATION" } })
  })
})

describe("GET/PATCH/DELETE /backlog/[itemId]", () => {
  it("gets an item scoped by project", async () => {
    asRole("dev")
    vi.mocked(svc.getBacklogItem).mockResolvedValue({ id: "pbi-1" } as never)
    expect((await item.GET(req("GET"), itemCtx())).status).toBe(200)
    expect(svc.getBacklogItem).toHaveBeenCalledWith(PROJECT_ID, "pbi-1")
  })

  it("returns 404 when the item is not in the project", async () => {
    asRole("dev")
    vi.mocked(svc.getBacklogItem).mockRejectedValue(new NotFoundError())
    expect(await read(await item.GET(req("GET"), itemCtx()))).toEqual({ status: 404, body: { error: "Not found", code: "NOT_FOUND" } })
  })

  it("updates as PO", async () => {
    asRole("po")
    vi.mocked(svc.updateBacklogItem).mockResolvedValue({ id: "pbi-1", status: "ready" } as never)
    const res = await item.PATCH(req("PATCH", { status: "ready", productGoalId: null }), itemCtx())
    expect(res.status).toBe(200)
    expect(svc.updateBacklogItem).toHaveBeenCalledWith(
      PROJECT_ID,
      "pbi-1",
      { status: "ready", productGoalId: null },
      ACTOR
    )
  })

  it("rejects a non-integer sort order", async () => {
    asRole("po")
    expect((await item.PATCH(req("PATCH", { sortOrder: 1.5 }), itemCtx())).status).toBe(400)
  })

  it("returns 500 with fallback when update fails", async () => {
    asRole("po")
    vi.mocked(svc.updateBacklogItem).mockRejectedValue(new Error("x"))
    expect(await read(await item.PATCH(req("PATCH", {}), itemCtx()))).toEqual({
      status: 500,
      body: { error: "更新に失敗しました", code: "INTERNAL" },
    })
  })

  it("deletes as PO only", async () => {
    asRole("po")
    vi.mocked(svc.deleteBacklogItem).mockResolvedValue(undefined as never)
    expect(await read(await item.DELETE(req("DELETE"), itemCtx()))).toEqual({ status: 200, body: { success: true } })
    expect(svc.deleteBacklogItem).toHaveBeenCalledWith(PROJECT_ID, "pbi-1", ACTOR)

    asRole("sm")
    expect((await item.DELETE(req("DELETE"), itemCtx())).status).toBe(403)
    expect(svc.deleteBacklogItem).toHaveBeenCalledTimes(1)
  })

  it("surfaces a conflict when the PBI is locked in a sprint", async () => {
    asRole("po")
    vi.mocked(svc.deleteBacklogItem).mockRejectedValue(new ConflictError("in sprint", { blocker: "s1" }))
    expect(await read(await item.DELETE(req("DELETE"), itemCtx()))).toEqual({
      status: 409,
      body: { error: "in sprint", blocker: "s1", code: "CONFLICT" },
    })
  })

  it("returns 500 when delete fails unexpectedly", async () => {
    asRole("po")
    vi.mocked(svc.deleteBacklogItem).mockRejectedValue(new Error("x"))
    expect((await item.DELETE(req("DELETE"), itemCtx())).status).toBe(500)
  })
})

describe("PUT /backlog/reorder", () => {
  it("reorders as PO", async () => {
    asRole("po")
    vi.mocked(svc.reorderBacklog).mockResolvedValue(undefined as never)
    const res = await read(await reorder.PUT(req("PUT", { orderedIds: ["b", "a"] }), ctx()))
    expect(res).toEqual({ status: 200, body: { success: true } })
    expect(svc.reorderBacklog).toHaveBeenCalledWith(PROJECT_ID, ["b", "a"], expect.objectContaining({ userId: expect.any(String) }))
  })

  it("rejects an empty list", async () => {
    asRole("po")
    expect((await reorder.PUT(req("PUT", { orderedIds: [] }), ctx())).status).toBe(400)
    expect(svc.reorderBacklog).not.toHaveBeenCalled()
  })

  it("refuses an SM (PO only)", async () => {
    asRole("sm")
    expect((await reorder.PUT(req("PUT", { orderedIds: ["a"] }), ctx())).status).toBe(403)
  })

  it("maps service failures to 500", async () => {
    asRole("po")
    vi.mocked(svc.reorderBacklog).mockRejectedValue(new Error("x"))
    expect(await read(await reorder.PUT(req("PUT", { orderedIds: ["a"] }), ctx()))).toEqual({
      status: 500,
      body: { error: "並び替えに失敗しました", code: "INTERNAL" },
    })
  })
})
