import { beforeEach, describe, expect, it, vi } from "vitest"
import { asRole, ctx, getReq, jsonReq } from "./a2-helpers"

const m = vi.hoisted(() => ({
  authMock: vi.fn(),
  memberFindFirst: vi.fn(),
  listPlan: vi.fn(),
  createPlanItem: vi.fn(),
  updatePlanItem: vi.fn(),
  deletePlanItem: vi.fn(),
  reorderPlan: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({ auth: () => m.authMock() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectMember: { findFirst: (...a: unknown[]) => m.memberFindFirst(...a) },
    projectSection: { findFirst: vi.fn().mockResolvedValue(null) },
  },
}))
vi.mock("@/services/plan/plan.service", () => ({
  listPlan: m.listPlan,
  createPlanItem: m.createPlanItem,
  updatePlanItem: m.updatePlanItem,
  deletePlanItem: m.deletePlanItem,
  reorderPlan: m.reorderPlan,
}))

const { GET, POST } = await import("../plan/route")
const item = await import("../plan/[itemId]/route")
const reorder = await import("../plan/reorder/route")
const { NotFoundError } = await import("@/services/_shared/errors")

const P = ctx({ projectId: "p1" })
const PI = ctx({ projectId: "p1", itemId: "i1" })

const validCreate = { name: "Phase 1", plannedStart: "2026-01-01", plannedEnd: "2026-02-01" }

describe("plan routes", () => {
  beforeEach(() => {
    Object.values(m).forEach((f) => f.mockReset())
  })

  describe("GET /plan", () => {
    it("401 without session", async () => {
      asRole(m, "none")
      const res = await GET(getReq(), P)
      expect(res.status).toBe(401)
      expect(m.listPlan).not.toHaveBeenCalled()
    })

    it("404 for non-member", async () => {
      asRole(m, "outsider")
      const res = await GET(getReq(), P)
      expect(res.status).toBe(404)
      expect(m.listPlan).not.toHaveBeenCalled()
    })

    it("returns the plan for a member", async () => {
      asRole(m, "dev")
      m.listPlan.mockResolvedValue([{ id: "i1" }])
      const res = await GET(getReq(), P)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual([{ id: "i1" }])
      expect(m.listPlan).toHaveBeenCalledWith("p1")
      expect(m.memberFindFirst).toHaveBeenCalledWith({ where: { projectId: "p1", userId: "user-1" }, select: { role: true } })
    })

    it("500 with fallback message on unexpected error", async () => {
      asRole(m, "dev")
      m.listPlan.mockRejectedValue(new Error("db down"))
      const res = await GET(getReq(), P)
      expect(res.status).toBe(500)
      expect(await res.json()).toEqual({ error: "取得に失敗しました", code: "INTERNAL" })
    })
  })

  describe("POST /plan", () => {
    it("403 for a dev (plan.write is PO/SM)", async () => {
      asRole(m, "dev")
      const res = await POST(jsonReq("POST", validCreate), P)
      expect(res.status).toBe(403)
      expect(m.createPlanItem).not.toHaveBeenCalled()
    })

    it("201 with created item, passing the actor", async () => {
      asRole(m, "sm")
      m.createPlanItem.mockResolvedValue({ id: "new" })
      const res = await POST(jsonReq("POST", validCreate), P)
      expect(res.status).toBe(201)
      expect(await res.json()).toEqual({ id: "new" })
      expect(m.createPlanItem).toHaveBeenCalledWith("p1", validCreate, {
        userId: "user-1",
        userName: "Taro",
        systemRole: "member",
      })
    })

    it("400 on schema violation (empty name)", async () => {
      asRole(m, "po")
      const res = await POST(jsonReq("POST", { ...validCreate, name: "" }), P)
      expect(res.status).toBe(400)
      expect(Array.isArray((await res.json()).error)).toBe(true)
    })

    it("400 on invalid status enum", async () => {
      asRole(m, "po")
      const res = await POST(jsonReq("POST", { ...validCreate, status: "bogus" }), P)
      expect(res.status).toBe(400)
    })

    it("400 Invalid JSON on malformed body", async () => {
      asRole(m, "po")
      const res = await POST(jsonReq("POST", "{not json"), P)
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: "Invalid JSON", code: "INVALID_JSON" })
    })
  })

  describe("PATCH/DELETE /plan/[itemId]", () => {
    it("PATCH 401 without session", async () => {
      asRole(m, "none")
      expect((await item.PATCH(jsonReq("PATCH", { name: "x" }), PI)).status).toBe(401)
    })

    it("PATCH updates the item", async () => {
      asRole(m, "po")
      m.updatePlanItem.mockResolvedValue({ id: "i1", name: "x" })
      const res = await item.PATCH(jsonReq("PATCH", { name: "x", sortOrder: 2 }), PI)
      expect(res.status).toBe(200)
      expect(m.updatePlanItem).toHaveBeenCalledWith("p1", "i1", { name: "x", sortOrder: 2 }, expect.objectContaining({ userId: "user-1" }))
    })

    it("PATCH 400 when sortOrder is not an integer", async () => {
      asRole(m, "po")
      expect((await item.PATCH(jsonReq("PATCH", { sortOrder: 1.5 }), PI)).status).toBe(400)
    })

    it("PATCH maps service NotFoundError to 404", async () => {
      asRole(m, "po")
      m.updatePlanItem.mockRejectedValue(new NotFoundError())
      const res = await item.PATCH(jsonReq("PATCH", { name: "x" }), PI)
      expect(res.status).toBe(404)
    })

    it("DELETE 404 for non-member", async () => {
      asRole(m, "outsider")
      expect((await item.DELETE(getReq(), PI)).status).toBe(404)
      expect(m.deletePlanItem).not.toHaveBeenCalled()
    })

    it("DELETE succeeds", async () => {
      asRole(m, "sm")
      m.deletePlanItem.mockResolvedValue(undefined)
      const res = await item.DELETE(getReq(), PI)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ success: true })
      expect(m.deletePlanItem).toHaveBeenCalledWith("p1", "i1")
    })

    it("DELETE maps Prisma P2025 to 404", async () => {
      asRole(m, "sm")
      m.deletePlanItem.mockRejectedValue({ code: "P2025" })
      expect((await item.DELETE(getReq(), PI)).status).toBe(404)
    })

    it("DELETE 500 on unexpected error", async () => {
      asRole(m, "sm")
      m.deletePlanItem.mockRejectedValue(new Error("boom"))
      expect((await item.DELETE(getReq(), PI)).status).toBe(500)
    })
  })

  describe("POST /plan/reorder", () => {
    const updates = [{ id: "a", parentId: null, sortOrder: 0 }]

    it("401 without session", async () => {
      asRole(m, "none")
      expect((await reorder.POST(jsonReq("POST", { updates }), P)).status).toBe(401)
    })

    it("reorders", async () => {
      asRole(m, "po")
      m.reorderPlan.mockResolvedValue(undefined)
      const res = await reorder.POST(jsonReq("POST", { updates }), P)
      expect(res.status).toBe(200)
      expect(m.reorderPlan).toHaveBeenCalledWith("p1", updates)
    })

    it("400 on empty updates array", async () => {
      asRole(m, "po")
      expect((await reorder.POST(jsonReq("POST", { updates: [] }), P)).status).toBe(400)
      expect(m.reorderPlan).not.toHaveBeenCalled()
    })

    it("500 on service failure", async () => {
      asRole(m, "po")
      m.reorderPlan.mockRejectedValue(new Error("x"))
      const res = await reorder.POST(jsonReq("POST", { updates }), P)
      expect(res.status).toBe(500)
      expect(await res.json()).toEqual({ error: "並び替えに失敗しました", code: "INTERNAL" })
    })
  })
})
