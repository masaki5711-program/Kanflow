import { beforeEach, describe, expect, it, vi } from "vitest"
import { PROJECT_ID, asRole, ctx, read, req } from "./route-harness"

vi.mock("@/lib/auth", async () => (await import("./route-harness")).authModule)
vi.mock("@/lib/prisma", async () => (await import("./route-harness")).prismaModule)
vi.mock("@/lib/logger", async () => (await import("./route-harness")).loggerModule)
vi.mock("@/services/attachments/attachments.service", () => ({
  createFolder: vi.fn(),
  updateFolder: vi.fn(),
  deleteFolder: vi.fn(),
}))

const svc = await import("@/services/attachments/attachments.service")
const list = await import("@/app/api/projects/[projectId]/folders/route")
const one = await import("@/app/api/projects/[projectId]/folders/[folderId]/route")
const { ValidationError, ConflictError } = await import("@/services/_shared")

const fCtx = () => ctx({ folderId: "f-1" })

beforeEach(() => {
  for (const fn of Object.values(svc)) vi.mocked(fn as () => unknown).mockReset()
})

describe("POST /folders", () => {
  it("creates a folder (201)", async () => {
    asRole("dev")
    vi.mocked(svc.createFolder).mockResolvedValue({ id: "f-1" } as never)
    expect(await read(await list.POST(req("POST", { name: "Docs", parentId: null }), ctx()))).toEqual({
      status: 201,
      body: { id: "f-1" },
    })
    expect(svc.createFolder).toHaveBeenCalledWith(PROJECT_ID, { name: "Docs", parentId: null })
  })

  it("rejects empty and over-long names", async () => {
    asRole("dev")
    expect((await list.POST(req("POST", { name: "" }), ctx())).status).toBe(400)
    expect((await list.POST(req("POST", { name: "x".repeat(101) }), ctx())).status).toBe(400)
    expect(svc.createFolder).not.toHaveBeenCalled()
  })

  it("surfaces a duplicate-name conflict", async () => {
    asRole("dev")
    vi.mocked(svc.createFolder).mockRejectedValue(new ConflictError("exists"))
    expect((await list.POST(req("POST", { name: "Docs" }), ctx())).status).toBe(409)
  })

  it("maps unknown errors to 500", async () => {
    asRole("dev")
    vi.mocked(svc.createFolder).mockRejectedValue(new Error("x"))
    expect(await read(await list.POST(req("POST", { name: "Docs" }), ctx()))).toEqual({
      status: 500,
      body: { error: "作成に失敗しました", code: "INTERNAL" },
    })
  })
})

describe("PATCH/DELETE /folders/[folderId]", () => {
  it("renames / reparents", async () => {
    asRole("dev")
    vi.mocked(svc.updateFolder).mockResolvedValue({ id: "f-1" } as never)
    expect((await one.PATCH(req("PATCH", { name: "New", parentId: null, sortOrder: 2 }), fCtx())).status).toBe(200)
    expect(svc.updateFolder).toHaveBeenCalledWith(PROJECT_ID, "f-1", { name: "New", parentId: null, sortOrder: 2 })
  })

  it("rejects a fractional sort order", async () => {
    asRole("dev")
    expect((await one.PATCH(req("PATCH", { sortOrder: 0.5 }), fCtx())).status).toBe(400)
  })

  it("surfaces a cycle rejection from the service", async () => {
    asRole("dev")
    vi.mocked(svc.updateFolder).mockRejectedValue(new ValidationError("cycle"))
    expect(await read(await one.PATCH(req("PATCH", { parentId: "child" }), fCtx()))).toEqual({
      status: 400,
      body: { error: "cycle", code: "VALIDATION" },
    })
  })

  it("maps update failure to 500", async () => {
    asRole("dev")
    vi.mocked(svc.updateFolder).mockRejectedValue(new Error("x"))
    expect((await one.PATCH(req("PATCH", {}), fCtx())).status).toBe(500)
  })

  it("deletes", async () => {
    asRole("dev")
    vi.mocked(svc.deleteFolder).mockResolvedValue(undefined as never)
    expect(await read(await one.DELETE(req("DELETE"), fCtx()))).toEqual({ status: 200, body: { success: true } })
    expect(svc.deleteFolder).toHaveBeenCalledWith(PROJECT_ID, "f-1")
  })

  it("maps delete failure to 500", async () => {
    asRole("dev")
    vi.mocked(svc.deleteFolder).mockRejectedValue(new Error("x"))
    expect((await one.DELETE(req("DELETE"), fCtx())).status).toBe(500)
  })
})
