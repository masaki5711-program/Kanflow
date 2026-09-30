import { beforeEach, describe, expect, it, vi } from "vitest"
import { ACTOR, PROJECT_ID, asRole, ctx, read, req } from "./route-harness"

vi.mock("@/lib/auth", async () => (await import("./route-harness")).authModule)
vi.mock("@/lib/prisma", async () => (await import("./route-harness")).prismaModule)
vi.mock("@/lib/logger", async () => (await import("./route-harness")).loggerModule)
vi.mock("@/services/events/events.service", () => ({
  listEvents: vi.fn(),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
}))

const svc = await import("@/services/events/events.service")
const list = await import("@/app/api/projects/[projectId]/events/route")
const one = await import("@/app/api/projects/[projectId]/events/[eventId]/route")
const { NotFoundError, ValidationError } = await import("@/services/_shared")

const evCtx = () => ctx({ eventId: "ev-1" })

beforeEach(() => {
  for (const fn of Object.values(svc)) vi.mocked(fn as () => unknown).mockReset()
})

describe("GET/POST /events", () => {
  it("lists events", async () => {
    asRole("dev")
    vi.mocked(svc.listEvents).mockResolvedValue([] as never)
    expect(await read(await list.GET(req("GET"), ctx()))).toEqual({ status: 200, body: [] })
    expect(svc.listEvents).toHaveBeenCalledWith(PROJECT_ID)
  })

  it("maps list failure to 500", async () => {
    asRole("dev")
    vi.mocked(svc.listEvents).mockRejectedValue(new Error("x"))
    expect((await list.GET(req("GET"), ctx())).status).toBe(500)
  })

  it("creates an event as a dev (201)", async () => {
    asRole("dev")
    vi.mocked(svc.createEvent).mockResolvedValue({ id: "ev-1" } as never)
    const body = { title: "Review", date: "2026-09-01" }
    expect(await read(await list.POST(req("POST", body), ctx()))).toEqual({ status: 201, body: { id: "ev-1" } })
    expect(svc.createEvent).toHaveBeenCalledWith(PROJECT_ID, body, ACTOR)
  })

  it("rejects a missing title / date", async () => {
    asRole("dev")
    expect((await list.POST(req("POST", { date: "2026-09-01" }), ctx())).status).toBe(400)
    expect((await list.POST(req("POST", { title: "x" }), ctx())).status).toBe(400)
    expect((await list.POST(req("POST", { title: "x".repeat(201), date: "d" }), ctx())).status).toBe(400)
    expect(svc.createEvent).not.toHaveBeenCalled()
  })

  it("surfaces service validation (e.g. end before start)", async () => {
    asRole("dev")
    vi.mocked(svc.createEvent).mockRejectedValue(new ValidationError("bad range"))
    expect(await read(await list.POST(req("POST", { title: "x", date: "d" }), ctx()))).toEqual({
      status: 400,
      body: { error: "bad range", code: "VALIDATION" },
    })
  })
})

describe("PATCH/DELETE /events/[eventId]", () => {
  it("updates with nullable fields", async () => {
    asRole("dev")
    vi.mocked(svc.updateEvent).mockResolvedValue({ id: "ev-1" } as never)
    const body = { description: null, endDate: null, sprintId: null }
    expect((await one.PATCH(req("PATCH", body), evCtx())).status).toBe(200)
    expect(svc.updateEvent).toHaveBeenCalledWith(PROJECT_ID, "ev-1", body, ACTOR)
  })

  it("rejects an over-long color", async () => {
    asRole("dev")
    expect((await one.PATCH(req("PATCH", { color: "x".repeat(21) }), evCtx())).status).toBe(400)
  })

  it("returns 404 for an event of another project", async () => {
    asRole("dev")
    vi.mocked(svc.updateEvent).mockRejectedValue(new NotFoundError())
    expect((await one.PATCH(req("PATCH", {}), evCtx())).status).toBe(404)
  })

  it("maps update failure to 500", async () => {
    asRole("dev")
    vi.mocked(svc.updateEvent).mockRejectedValue(new Error("x"))
    expect((await one.PATCH(req("PATCH", {}), evCtx())).status).toBe(500)
  })

  it("deletes", async () => {
    asRole("dev")
    vi.mocked(svc.deleteEvent).mockResolvedValue(undefined as never)
    expect(await read(await one.DELETE(req("DELETE"), evCtx()))).toEqual({ status: 200, body: { success: true } })
    expect(svc.deleteEvent).toHaveBeenCalledWith(PROJECT_ID, "ev-1")
  })

  it("maps delete failure to 500 with fallback", async () => {
    asRole("dev")
    vi.mocked(svc.deleteEvent).mockRejectedValue(new Error("x"))
    expect(await read(await one.DELETE(req("DELETE"), evCtx()))).toEqual({
      status: 500,
      body: { error: "削除に失敗しました", code: "INTERNAL" },
    })
  })

  it("refuses a section manager without membership (event.write is member-only)", async () => {
    asRole(null, "section_manager")
    const { sectionFindFirst } = await import("./route-harness")
    sectionFindFirst.mockResolvedValue({ sectionId: "sec" })
    expect((await one.DELETE(req("DELETE"), evCtx())).status).toBe(403)
    expect(svc.deleteEvent).not.toHaveBeenCalled()
  })
})
