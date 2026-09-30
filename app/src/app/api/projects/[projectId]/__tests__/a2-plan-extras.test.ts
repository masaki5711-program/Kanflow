import { beforeEach, describe, expect, it, vi } from "vitest"
import { asRole, ctx, getReq, jsonReq } from "./a2-helpers"

const m = vi.hoisted(() => ({
  authMock: vi.fn(),
  memberFindFirst: vi.fn(),
  getPlanLinks: vi.fn(),
  setPlanLinks: vi.fn(),
  listLinkablePbis: vi.fn(),
  setBaseline: vi.fn(),
  clearBaseline: vi.fn(),
  createDependency: vi.fn(),
  deleteDependency: vi.fn(),
  exportPlan: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({ auth: () => m.authMock() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectMember: { findFirst: (...a: unknown[]) => m.memberFindFirst(...a) },
    projectSection: { findFirst: vi.fn().mockResolvedValue(null) },
    project: { findFirst: vi.fn().mockResolvedValue({ id: "live" }) },
  },
}))
vi.mock("@/services/plan/plan.links", () => ({ getPlanLinks: m.getPlanLinks, setPlanLinks: m.setPlanLinks, listLinkablePbis: m.listLinkablePbis }))
vi.mock("@/services/plan/plan.schedule", () => ({
  setBaseline: m.setBaseline,
  clearBaseline: m.clearBaseline,
  createDependency: m.createDependency,
  deleteDependency: m.deleteDependency,
}))
vi.mock("@/services/plan/plan.export", async () => ({
  ...(await vi.importActual<typeof import("@/services/plan/plan.export")>("@/services/plan/plan.export")),
  exportPlan: m.exportPlan,
}))

const links = await import("../plan/[itemId]/links/route")
const linkable = await import("../plan/linkable-pbis/route")
const baseline = await import("../plan/baseline/route")
const deps = await import("../plan/dependencies/route")
const dep = await import("../plan/dependencies/[dependencyId]/route")
const exp = await import("../plan/export/route")
const { ValidationError } = await import("@/services/_shared/errors")

const P = ctx({ projectId: "p1" })
const PI = ctx({ projectId: "p1", itemId: "i1" })
const PD = ctx({ projectId: "p1", dependencyId: "d1" })
const URL_BASE = "http://localhost/api/projects/p1/plan"

describe("plan extra routes", () => {
  beforeEach(() => Object.values(m).forEach((f) => f.mockReset()))

  describe("links", () => {
    it("GET is readable by members (project.view)", async () => {
      asRole(m, "dev")
      m.getPlanLinks.mockResolvedValue({ pbis: [] })
      const res = await links.GET(getReq(), PI)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ pbis: [] })
      expect(m.getPlanLinks).toHaveBeenCalledWith("p1", "i1")
    })

    it("PUT needs plan.write and validates the body", async () => {
      asRole(m, "dev")
      expect((await links.PUT(jsonReq("PUT", { pbiIds: [] }), PI)).status).toBe(403)
      asRole(m, "po")
      expect((await links.PUT(jsonReq("PUT", { pbiIds: "x" }), PI)).status).toBe(400)
      m.setPlanLinks.mockResolvedValue({ pbis: [{ id: "b1" }] })
      const res = await links.PUT(jsonReq("PUT", { pbiIds: ["b1"] }), PI)
      expect(res.status).toBe(200)
      expect(m.setPlanLinks).toHaveBeenCalledWith("p1", "i1", ["b1"], expect.objectContaining({ userId: "user-1" }))
    })

    it("PUT maps PLAN_LINK_REQUIRES_LEAF to 400 with its code", async () => {
      asRole(m, "sm")
      m.setPlanLinks.mockRejectedValue(new ValidationError("x", {}, "PLAN_LINK_REQUIRES_LEAF"))
      const res = await links.PUT(jsonReq("PUT", { pbiIds: [] }), PI)
      expect(res.status).toBe(400)
      expect((await res.json()).code).toBe("PLAN_LINK_REQUIRES_LEAF")
    })

    it("404 for outsiders", async () => {
      asRole(m, "outsider")
      expect((await links.GET(getReq(), PI)).status).toBe(404)
      expect(m.getPlanLinks).not.toHaveBeenCalled()
    })
  })

  it("linkable-pbis passes ?q", async () => {
    asRole(m, "dev")
    m.listLinkablePbis.mockResolvedValue({ pbis: [] })
    await linkable.GET(getReq(`${URL_BASE}/linkable-pbis?q=%2312`), P)
    expect(m.listLinkablePbis).toHaveBeenCalledWith("p1", "#12")
    await linkable.GET(getReq(`${URL_BASE}/linkable-pbis`), P)
    expect(m.listLinkablePbis).toHaveBeenLastCalledWith("p1", undefined)
  })

  describe("baseline", () => {
    it("POST with an empty body = whole project; with itemIds = those items", async () => {
      asRole(m, "po")
      m.setBaseline.mockResolvedValue({ updated: 3 })
      const empty = new Request(`${URL_BASE}/baseline`, { method: "POST" })
      const res = await baseline.POST(empty, P)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ updated: 3 })
      expect(m.setBaseline).toHaveBeenCalledWith("p1", undefined, expect.anything())
      await baseline.POST(jsonReq("POST", { itemIds: ["a"] }), P)
      expect(m.setBaseline).toHaveBeenLastCalledWith("p1", ["a"], expect.anything())
      expect((await baseline.POST(jsonReq("POST", "{bad"), P)).status).toBe(400)
    })

    it("DELETE clears; devs are refused", async () => {
      asRole(m, "dev")
      expect((await baseline.DELETE(getReq(), P)).status).toBe(403)
      asRole(m, "sm")
      m.clearBaseline.mockResolvedValue({ updated: 1 })
      expect(await (await baseline.DELETE(getReq(), P)).json()).toEqual({ updated: 1 })
    })
  })

  describe("dependencies", () => {
    it("POST 201; cycle → 400 PLAN_DEPENDENCY_CYCLE", async () => {
      asRole(m, "po")
      m.createDependency.mockResolvedValue({ id: "d1", predecessorId: "a", successorId: "b" })
      const res = await deps.POST(jsonReq("POST", { predecessorId: "a", successorId: "b" }), P)
      expect(res.status).toBe(201)
      m.createDependency.mockRejectedValue(new ValidationError("x", {}, "PLAN_DEPENDENCY_CYCLE"))
      const bad = await deps.POST(jsonReq("POST", { predecessorId: "b", successorId: "a" }), P)
      expect(bad.status).toBe(400)
      expect((await bad.json()).code).toBe("PLAN_DEPENDENCY_CYCLE")
      expect((await deps.POST(jsonReq("POST", { predecessorId: "a" }), P)).status).toBe(400)
    })

    it("DELETE", async () => {
      asRole(m, "po")
      m.deleteDependency.mockResolvedValue(undefined)
      const res = await dep.DELETE(getReq(), PD)
      expect(res.status).toBe(200)
      expect(m.deleteDependency).toHaveBeenCalledWith("p1", "d1", expect.anything())
    })
  })

  describe("export", () => {
    it("streams an xlsx attachment with the UTF-8 file name", async () => {
      asRole(m, "dev")
      m.exportPlan.mockResolvedValue({ buffer: Buffer.from("PK.."), fileName: "plan-計画-2026-10-05.xlsx" })
      const res = await exp.GET(getReq(`${URL_BASE}/export?lang=en`), P)
      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      expect(res.headers.get("content-disposition")).toContain("filename*=UTF-8''plan-")
      expect(m.exportPlan).toHaveBeenCalledWith("p1", "en")
      expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("PK..")
    })

    it("unknown lang falls back to ja; errors map to 500", async () => {
      asRole(m, "dev")
      m.exportPlan.mockRejectedValue(new Error("boom"))
      const res = await exp.GET(getReq(`${URL_BASE}/export?lang=xx`), P)
      expect(m.exportPlan).toHaveBeenCalledWith("p1", "ja")
      expect(res.status).toBe(500)
    })
  })
})
