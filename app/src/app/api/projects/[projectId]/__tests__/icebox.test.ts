import { beforeEach, describe, expect, it, vi } from "vitest"
import { ACTOR, PROJECT_ID, asRole, ctx, read, req, sectionFindFirst } from "./route-harness"

vi.mock("@/lib/auth", async () => (await import("./route-harness")).authModule)
vi.mock("@/lib/prisma", async () => (await import("./route-harness")).prismaModule)
vi.mock("@/lib/logger", async () => (await import("./route-harness")).loggerModule)
vi.mock("@/services/icebox/icebox.service", () => ({
  listIcebox: vi.fn(),
  createIceboxItem: vi.fn(),
  updateIceboxItem: vi.fn(),
  deleteIceboxItem: vi.fn(),
}))

const svc = await import("@/services/icebox/icebox.service")
const list = await import("@/app/api/projects/[projectId]/icebox/route")
const one = await import("@/app/api/projects/[projectId]/icebox/[itemId]/route")
const { NotFoundError } = await import("@/services/_shared")

const iCtx = () => ctx({ itemId: "ice-1" })

beforeEach(() => {
  for (const fn of Object.values(svc)) vi.mocked(fn as () => unknown).mockReset()
})

describe("GET/POST /icebox", () => {
  it("lists icebox items", async () => {
    asRole("dev")
    vi.mocked(svc.listIcebox).mockResolvedValue([] as never)
    expect(await read(await list.GET(req("GET"), ctx()))).toEqual({ status: 200, body: [] })
    expect(svc.listIcebox).toHaveBeenCalledWith(PROJECT_ID)
  })

  it("maps list failure to 500", async () => {
    asRole("dev")
    vi.mocked(svc.listIcebox).mockRejectedValue(new Error("x"))
    expect((await list.GET(req("GET"), ctx())).status).toBe(500)
  })

  it("creates a request as a dev (201)", async () => {
    asRole("dev")
    vi.mocked(svc.createIceboxItem).mockResolvedValue({ id: "ice-1" } as never)
    expect((await list.POST(req("POST", { request: "Need X" }), ctx())).status).toBe(201)
    expect(svc.createIceboxItem).toHaveBeenCalledWith(PROJECT_ID, { request: "Need X" }, ACTOR)
  })

  it("lets a section manager of the project file a request", async () => {
    asRole(null, "section_manager")
    sectionFindFirst.mockResolvedValue({ sectionId: "sec" })
    vi.mocked(svc.createIceboxItem).mockResolvedValue({ id: "ice-1" } as never)
    expect((await list.POST(req("POST", { request: "Need X" }), ctx())).status).toBe(201)
  })

  it("rejects an empty or over-long request", async () => {
    asRole("dev")
    expect((await list.POST(req("POST", { request: "" }), ctx())).status).toBe(400)
    expect((await list.POST(req("POST", { request: "x".repeat(5001) }), ctx())).status).toBe(400)
    expect(svc.createIceboxItem).not.toHaveBeenCalled()
  })

  it("maps create failure to 500", async () => {
    asRole("dev")
    vi.mocked(svc.createIceboxItem).mockRejectedValue(new Error("x"))
    expect((await list.POST(req("POST", { request: "r" }), ctx())).status).toBe(500)
  })
})

describe("PATCH/DELETE /icebox/[itemId]", () => {
  it("updates status", async () => {
    asRole("dev")
    vi.mocked(svc.updateIceboxItem).mockResolvedValue({ id: "ice-1" } as never)
    expect((await one.PATCH(req("PATCH", { status: "frozen", background: null }), iCtx())).status).toBe(200)
    expect(svc.updateIceboxItem).toHaveBeenCalledWith(PROJECT_ID, "ice-1", { status: "frozen", background: null }, ACTOR)
  })

  it("rejects an unknown status", async () => {
    asRole("dev")
    expect((await one.PATCH(req("PATCH", { status: "archived" }), iCtx())).status).toBe(400)
  })

  it("404 / 500 from the service", async () => {
    asRole("dev")
    vi.mocked(svc.updateIceboxItem).mockRejectedValueOnce(new NotFoundError())
    expect((await one.PATCH(req("PATCH", {}), iCtx())).status).toBe(404)
    vi.mocked(svc.updateIceboxItem).mockRejectedValueOnce(new Error("x"))
    expect((await one.PATCH(req("PATCH", {}), iCtx())).status).toBe(500)
  })

  it("deletes", async () => {
    asRole("dev")
    vi.mocked(svc.deleteIceboxItem).mockResolvedValue(undefined as never)
    expect(await read(await one.DELETE(req("DELETE"), iCtx()))).toEqual({ status: 200, body: { success: true } })
    expect(svc.deleteIceboxItem).toHaveBeenCalledWith(PROJECT_ID, "ice-1", ACTOR, undefined)
  })

  it("maps delete failure to 500", async () => {
    asRole("dev")
    vi.mocked(svc.deleteIceboxItem).mockRejectedValue(new Error("x"))
    expect(await read(await one.DELETE(req("DELETE"), iCtx()))).toEqual({
      status: 500,
      body: { error: "削除に失敗しました", code: "INTERNAL" },
    })
  })
})
