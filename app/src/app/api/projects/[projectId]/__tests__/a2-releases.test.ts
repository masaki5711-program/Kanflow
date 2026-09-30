import { beforeEach, describe, expect, it, vi } from "vitest"
import { asRole, ctx, getReq, jsonReq } from "./a2-helpers"

const m = vi.hoisted(() => ({
  authMock: vi.fn(),
  memberFindFirst: vi.fn(),
  listReleases: vi.fn(),
  updateReleaseItem: vi.fn(),
  deleteReleaseItem: vi.fn(),
  importReleaseItems: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({ auth: () => m.authMock() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectMember: { findFirst: (...a: unknown[]) => m.memberFindFirst(...a) },
    projectSection: { findFirst: vi.fn().mockResolvedValue(null) },
    project: { findFirst: vi.fn().mockResolvedValue({ id: "live" }) },
  },
}))
vi.mock("@/services/releases/releases.service", () => ({
  listReleases: m.listReleases,
  updateReleaseItem: m.updateReleaseItem,
  deleteReleaseItem: m.deleteReleaseItem,
  importReleaseItems: m.importReleaseItems,
}))

const list = await import("../releases/route")
const one = await import("../releases/[id]/route")
const imp = await import("../releases/import/route")
const { ConflictError } = await import("@/services/_shared/errors")

const P = ctx({ projectId: "p1" })
const PR = ctx({ projectId: "p1", id: "r1" })

describe("release routes", () => {
  beforeEach(() => {
    Object.values(m).forEach((f) => f.mockReset())
  })

  describe("GET /releases", () => {
    it("401 without session", async () => {
      asRole(m, "none")
      expect((await list.GET(getReq(), P)).status).toBe(401)
    })

    it("404 for non-member", async () => {
      asRole(m, "outsider")
      expect((await list.GET(getReq(), P)).status).toBe(404)
      expect(m.listReleases).not.toHaveBeenCalled()
    })

    it("lists for any member", async () => {
      asRole(m, "dev")
      m.listReleases.mockResolvedValue([{ id: "r1" }])
      const res = await list.GET(getReq(), P)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual([{ id: "r1" }])
      expect(m.listReleases).toHaveBeenCalledWith("p1")
    })

    it("500 on failure", async () => {
      asRole(m, "dev")
      m.listReleases.mockRejectedValue(new Error("x"))
      expect((await list.GET(getReq(), P)).status).toBe(500)
    })
  })

  describe("PATCH/DELETE /releases/[id]", () => {
    it("403 for SM (release.manage is PO only)", async () => {
      asRole(m, "sm")
      expect((await one.PATCH(jsonReq("PATCH", { status: "ready" }), PR)).status).toBe(403)
      expect(m.updateReleaseItem).not.toHaveBeenCalled()
    })

    it("PATCH updates as PO", async () => {
      asRole(m, "po")
      m.updateReleaseItem.mockResolvedValue({ id: "r1", status: "released" })
      const res = await one.PATCH(jsonReq("PATCH", { status: "released", releaseDate: null }), PR)
      expect(res.status).toBe(200)
      expect(m.updateReleaseItem).toHaveBeenCalledWith(
        "p1",
        "r1",
        { status: "released", releaseDate: null },
        expect.objectContaining({ userId: "user-1" })
      )
    })

    it("PATCH 400 on invalid status", async () => {
      asRole(m, "po")
      expect((await one.PATCH(jsonReq("PATCH", { status: "shipped" }), PR)).status).toBe(400)
    })

    it("PATCH 400 when planVersion exceeds 100 chars", async () => {
      asRole(m, "po")
      expect((await one.PATCH(jsonReq("PATCH", { planVersion: "v".repeat(101) }), PR)).status).toBe(400)
    })

    it("DELETE 401 without session", async () => {
      asRole(m, "none")
      expect((await one.DELETE(getReq(), PR)).status).toBe(401)
    })

    it("DELETE succeeds as admin", async () => {
      asRole(m, "admin")
      m.deleteReleaseItem.mockResolvedValue(undefined)
      const res = await one.DELETE(getReq(), PR)
      expect(res.status).toBe(200)
      expect(m.deleteReleaseItem).toHaveBeenCalledWith("p1", "r1", expect.objectContaining({ userId: expect.any(String) }))
      expect(m.memberFindFirst).not.toHaveBeenCalled()
    })

    it("DELETE 500 on failure", async () => {
      asRole(m, "po")
      m.deleteReleaseItem.mockRejectedValue(new Error("x"))
      const res = await one.DELETE(getReq(), PR)
      expect(res.status).toBe(500)
      expect(await res.json()).toEqual({ error: "削除に失敗しました", code: "INTERNAL" })
    })
  })

  describe("POST /releases/import", () => {
    it("404 for non-member", async () => {
      asRole(m, "outsider")
      expect((await imp.POST(jsonReq("POST", { pbItemIds: ["a"] }), P)).status).toBe(404)
    })

    it("imports and returns 201", async () => {
      asRole(m, "po")
      m.importReleaseItems.mockResolvedValue({ created: 2 })
      const res = await imp.POST(jsonReq("POST", { pbItemIds: ["a", "b"], planVersion: "1.0" }), P)
      expect(res.status).toBe(201)
      expect(await res.json()).toEqual({ created: 2 })
      expect(m.importReleaseItems).toHaveBeenCalledWith("p1", { pbItemIds: ["a", "b"], planVersion: "1.0" }, expect.objectContaining({ userId: expect.any(String) }))
    })

    it("400 on empty pbItemIds", async () => {
      asRole(m, "po")
      expect((await imp.POST(jsonReq("POST", { pbItemIds: [] }), P)).status).toBe(400)
      expect(m.importReleaseItems).not.toHaveBeenCalled()
    })

    it("maps ServiceError (409) with message", async () => {
      asRole(m, "po")
      m.importReleaseItems.mockRejectedValue(new ConflictError("already imported"))
      const res = await imp.POST(jsonReq("POST", { pbItemIds: ["a"] }), P)
      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({ error: "already imported", code: "CONFLICT" })
    })
  })
})
