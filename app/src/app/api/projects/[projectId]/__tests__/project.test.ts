import { beforeEach, describe, expect, it, vi } from "vitest"
import { ACTOR, PROJECT_ID, asRole, ctx, read, req, signedOut } from "./route-harness"

vi.mock("@/lib/auth", async () => (await import("./route-harness")).authModule)
vi.mock("@/lib/prisma", async () => (await import("./route-harness")).prismaModule)
vi.mock("@/lib/logger", async () => (await import("./route-harness")).loggerModule)
vi.mock("@/services/projects/projects.service", () => ({
  getProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
}))

const svc = await import("@/services/projects/projects.service")
const { GET, PATCH, DELETE } = await import("@/app/api/projects/[projectId]/route")
const { NotFoundError } = await import("@/services/_shared")

describe("/api/projects/[projectId]", () => {
  beforeEach(() => {
    vi.mocked(svc.getProject).mockReset()
    vi.mocked(svc.updateProject).mockReset()
    vi.mocked(svc.deleteProject).mockReset()
  })

  describe("GET", () => {
    it("returns the project for a member, passing the access path", async () => {
      asRole("dev")
      vi.mocked(svc.getProject).mockResolvedValue({ id: PROJECT_ID, name: "P" } as never)
      const res = await read(await GET(req("GET"), ctx()))
      expect(res).toEqual({ status: 200, body: { id: PROJECT_ID, name: "P" } })
      expect(svc.getProject).toHaveBeenCalledWith(PROJECT_ID, "member")
    })

    it("maps NotFoundError to 404", async () => {
      asRole("dev")
      vi.mocked(svc.getProject).mockRejectedValue(new NotFoundError("gone"))
      expect(await read(await GET(req("GET"), ctx()))).toEqual({ status: 404, body: { error: "gone", code: "NOT_FOUND" } })
    })

    it("maps unknown errors to 500 with the fallback message", async () => {
      asRole("dev")
      vi.mocked(svc.getProject).mockRejectedValue(new Error("db down"))
      expect(await read(await GET(req("GET"), ctx()))).toEqual({
        status: 500,
        body: { error: "取得に失敗しました", code: "INTERNAL" },
      })
    })

    it("returns 401 when signed out", async () => {
      signedOut()
      expect((await GET(req("GET"), ctx())).status).toBe(401)
    })
  })

  describe("PATCH", () => {
    it("lets a dev change only the card color", async () => {
      asRole("dev")
      vi.mocked(svc.updateProject).mockResolvedValue({ id: PROJECT_ID, cardColor: "red" } as never)
      const res = await read(await PATCH(req("PATCH", { cardColor: "red" }), ctx()))
      expect(res.status).toBe(200)
      expect(svc.updateProject).toHaveBeenCalledWith(PROJECT_ID, { cardColor: "red" }, ACTOR)
    })

    it("refuses a dev renaming the project (403, no update)", async () => {
      asRole("dev")
      const res = await read(await PATCH(req("PATCH", { name: "new" }), ctx()))
      expect(res).toEqual({ status: 403, body: { error: "権限がありません", code: "FORBIDDEN" } })
      expect(svc.updateProject).not.toHaveBeenCalled()
    })

    it("refuses an SM editing progress (PO only)", async () => {
      asRole("sm")
      const res = await PATCH(req("PATCH", { progressPct: 50 }), ctx())
      expect(res.status).toBe(403)
      expect(svc.updateProject).not.toHaveBeenCalled()
    })

    it("lets a PO update progress and sections", async () => {
      asRole("po")
      vi.mocked(svc.updateProject).mockResolvedValue({ ok: true } as never)
      const res = await PATCH(req("PATCH", { progressPct: 40, sectionIds: ["s1"] }), ctx())
      expect(res.status).toBe(200)
    })

    it("returns 400 for schema violations", async () => {
      asRole("po")
      const res = await read(await PATCH(req("PATCH", { progressPct: 101 }), ctx()))
      expect(res.status).toBe(400)
      expect(Array.isArray((res.body as { error: unknown }).error)).toBe(true)
    })

    it("returns 400 for malformed JSON", async () => {
      asRole("po")
      expect(await read(await PATCH(req("PATCH", "{nope"), ctx()))).toEqual({
        status: 400,
        body: { error: "Invalid JSON", code: "INVALID_JSON" },
      })
    })

    it("maps Prisma P2025 to 404", async () => {
      asRole("po")
      vi.mocked(svc.updateProject).mockRejectedValue(Object.assign(new Error("x"), { code: "P2025" }))
      expect((await PATCH(req("PATCH", { name: "n" }), ctx())).status).toBe(404)
    })

    it("returns 404 for a non-member", async () => {
      asRole(null)
      expect((await PATCH(req("PATCH", { cardColor: "red" }), ctx())).status).toBe(404)
    })
  })

  describe("DELETE", () => {
    it("deletes for the PO", async () => {
      asRole("po")
      vi.mocked(svc.deleteProject).mockResolvedValue(undefined)
      expect(await read(await DELETE(req("DELETE"), ctx()))).toEqual({ status: 200, body: { success: true } })
      expect(svc.deleteProject).toHaveBeenCalledWith(PROJECT_ID)
    })

    it("lets a system admin delete without membership", async () => {
      asRole(null, "admin")
      vi.mocked(svc.deleteProject).mockResolvedValue(undefined)
      expect((await DELETE(req("DELETE"), ctx())).status).toBe(200)
    })

    it("refuses an SM (403)", async () => {
      asRole("sm")
      expect((await DELETE(req("DELETE"), ctx())).status).toBe(403)
      expect(svc.deleteProject).not.toHaveBeenCalled()
    })

    it("returns 500 when the service fails", async () => {
      asRole("po")
      vi.mocked(svc.deleteProject).mockRejectedValue(new Error("fs"))
      expect(await read(await DELETE(req("DELETE"), ctx()))).toEqual({
        status: 500,
        body: { error: "Failed to delete project", code: "INTERNAL" },
      })
    })
  })
})
