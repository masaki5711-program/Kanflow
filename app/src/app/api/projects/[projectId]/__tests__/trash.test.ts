import { beforeEach, describe, expect, it, vi } from "vitest"
import { ACTOR, PROJECT_ID, asRole, ctx, projectFindFirst, read, req } from "./route-harness"

vi.mock("@/lib/auth", async () => (await import("./route-harness")).authModule)
vi.mock("@/lib/prisma", async () => (await import("./route-harness")).prismaModule)
vi.mock("@/lib/logger", async () => (await import("./route-harness")).loggerModule)
vi.mock("@/services/trash/trash.service", () => ({
  listProjectTrash: vi.fn(),
  restoreTrashItem: vi.fn(),
  purgeTrashItem: vi.fn(),
}))

const svc = await import("@/services/trash/trash.service")
const list = await import("@/app/api/projects/[projectId]/trash/route")
const item = await import("@/app/api/projects/[projectId]/trash/[entityType]/[id]/route")
const restore = await import("@/app/api/projects/[projectId]/trash/[entityType]/[id]/restore/route")
const { ConflictError, NotFoundError } = await import("@/services/_shared")

const itemCtx = (entityType = "backlog_item") => ctx({ entityType, id: "pbi-1" })

beforeEach(() => {
  for (const fn of Object.values(svc)) vi.mocked(fn as () => unknown).mockReset()
})

describe("GET /trash", () => {
  it("lists the trash for PO and SM", async () => {
    const body = { retentionDays: 30, items: [] }
    vi.mocked(svc.listProjectTrash).mockResolvedValue(body)
    asRole("sm")
    expect(await read(await list.GET(req("GET"), ctx()))).toEqual({ status: 200, body })
    expect(svc.listProjectTrash).toHaveBeenCalledWith(PROJECT_ID)
  })

  it("refuses a Dev (403) and a non-member (404)", async () => {
    asRole("dev")
    expect((await list.GET(req("GET"), ctx())).status).toBe(403)
    asRole(null)
    expect((await list.GET(req("GET"), ctx())).status).toBe(404)
    expect(svc.listProjectTrash).not.toHaveBeenCalled()
  })

  it("404s for everyone once the project itself is in the trash", async () => {
    asRole(null, "admin")
    projectFindFirst.mockResolvedValue(null)
    expect((await list.GET(req("GET"), ctx())).status).toBe(404)
  })

  it("returns 500 when listing fails", async () => {
    asRole("po")
    vi.mocked(svc.listProjectTrash).mockRejectedValue(new Error("x"))
    expect((await list.GET(req("GET"), ctx())).status).toBe(500)
  })
})

describe("POST /trash/[entityType]/[id]/restore", () => {
  it("restores for SM with the session actor", async () => {
    asRole("sm")
    vi.mocked(svc.restoreTrashItem).mockResolvedValue(undefined)
    expect(await read(await restore.POST(req("POST"), itemCtx("icebox_item")))).toEqual({ status: 200, body: { success: true } })
    expect(svc.restoreTrashItem).toHaveBeenCalledWith(PROJECT_ID, "icebox_item", "pbi-1", ACTOR)
  })

  it("404s for an unknown entity type without calling the service", async () => {
    asRole("po")
    expect((await restore.POST(req("POST"), itemCtx("sprint"))).status).toBe(404)
    expect(svc.restoreTrashItem).not.toHaveBeenCalled()
  })

  it("surfaces PROJECT_IN_TRASH / not-found errors from the service", async () => {
    asRole("po")
    vi.mocked(svc.restoreTrashItem).mockRejectedValueOnce(new ConflictError("x", {}, "PROJECT_IN_TRASH"))
    expect(await read(await restore.POST(req("POST"), itemCtx()))).toEqual({
      status: 409,
      body: { error: "x", code: "PROJECT_IN_TRASH" },
    })
    vi.mocked(svc.restoreTrashItem).mockRejectedValueOnce(new NotFoundError("Not found", {}, "PBI_NOT_FOUND"))
    expect((await restore.POST(req("POST"), itemCtx())).status).toBe(404)
  })

  it("refuses a Dev (403)", async () => {
    asRole("dev")
    expect((await restore.POST(req("POST"), itemCtx())).status).toBe(403)
  })
})

describe("DELETE /trash/[entityType]/[id] (purge)", () => {
  it("purges for PO only", async () => {
    asRole("po")
    vi.mocked(svc.purgeTrashItem).mockResolvedValue(undefined)
    expect(await read(await item.DELETE(req("DELETE"), itemCtx()))).toEqual({ status: 200, body: { success: true } })
    expect(svc.purgeTrashItem).toHaveBeenCalledWith(PROJECT_ID, "backlog_item", "pbi-1", ACTOR)

    asRole("sm")
    expect((await item.DELETE(req("DELETE"), itemCtx())).status).toBe(403)
    expect(svc.purgeTrashItem).toHaveBeenCalledTimes(1)
  })

  it("lets an admin purge and 404s an unknown type", async () => {
    asRole(null, "admin")
    vi.mocked(svc.purgeTrashItem).mockResolvedValue(undefined)
    expect((await item.DELETE(req("DELETE"), itemCtx("icebox_item"))).status).toBe(200)
    expect((await item.DELETE(req("DELETE"), itemCtx("nope"))).status).toBe(404)
  })

  it("returns 500 when the purge fails unexpectedly", async () => {
    asRole("po")
    vi.mocked(svc.purgeTrashItem).mockRejectedValue(new Error("disk"))
    expect(await read(await item.DELETE(req("DELETE"), itemCtx()))).toEqual({
      status: 500,
      body: { error: "削除に失敗しました", code: "INTERNAL" },
    })
  })
})
