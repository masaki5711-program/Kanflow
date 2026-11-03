import { beforeEach, describe, expect, it, vi } from "vitest"
import { asRole, ctx, getReq, jsonReq, session } from "./a2-helpers"

const m = vi.hoisted(() => ({
  authMock: vi.fn(),
  memberFindFirst: vi.fn(),
  listProjectAllocations: vi.fn(),
  createAllocation: vi.fn(),
  updateCapacity: vi.fn(),
  deleteCapacity: vi.fn(),
  listUserCapacity: vi.fn(),
  createUserCapacity: vi.fn(),
  sharesSectionAsManager: vi.fn(),
  memberLoad: vi.fn(),
  levelProject: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({ auth: () => m.authMock() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectMember: { findFirst: (...a: unknown[]) => m.memberFindFirst(...a) },
    projectSection: { findFirst: vi.fn().mockResolvedValue(null) },
    project: { findFirst: vi.fn().mockResolvedValue({ id: "live" }) },
  },
}))
vi.mock("@/services/plan-leveling/capacity.service", () => ({
  listProjectAllocations: m.listProjectAllocations,
  createAllocation: m.createAllocation,
  updateCapacity: m.updateCapacity,
  deleteCapacity: m.deleteCapacity,
  listUserCapacity: m.listUserCapacity,
  createUserCapacity: m.createUserCapacity,
  sharesSectionAsManager: m.sharesSectionAsManager,
}))
vi.mock("@/services/plan-leveling/load.service", () => ({ memberLoad: m.memberLoad, levelProject: m.levelProject }))

const projectCapacity = await import("../capacity/route")
const projectCapacityRow = await import("../capacity/[capacityId]/route")
const userCapacity = await import("../../../users/[id]/capacity/route")
const userCapacityRow = await import("../../../users/[id]/capacity/[capacityId]/route")
const memberLoadRoute = await import("../plan/member-load/route")
const levelRoute = await import("../plan/level/route")

const P = ctx({ projectId: "p1" })
const PC = ctx({ projectId: "p1", capacityId: "c1" })
const U = (id: string) => ctx({ id })
const UC = (id: string) => ctx({ id, capacityId: "c1" })
const PERIOD = { from: "2026-11-01", to: null, fte: 0.5 }

describe("project allocation routes (capacity.manage)", () => {
  beforeEach(() => Object.values(m).forEach((f) => f.mockReset()))

  it("po_sets_only_own_project_allocation: PO / SM allowed; dev and outsiders denied", async () => {
    asRole(m, "dev")
    expect((await projectCapacity.GET(getReq(), P)).status).toBe(403)
    expect((await projectCapacity.POST(jsonReq("POST", { userId: "u2", ...PERIOD }), P)).status).toBe(403)
    asRole(m, "outsider")
    expect((await projectCapacity.POST(jsonReq("POST", { userId: "u2", ...PERIOD }), P)).status).toBe(404)
    asRole(m, "sm")
    m.createAllocation.mockResolvedValue({ id: "c1" })
    expect((await projectCapacity.POST(jsonReq("POST", { userId: "u2", ...PERIOD }), P)).status).toBe(201)
    m.updateCapacity.mockResolvedValue({ id: "c1" })
    expect((await projectCapacityRow.PATCH(jsonReq("PATCH", { ...PERIOD, version: 0 }), PC)).status).toBe(200)
    // The row is looked up within THIS project only.
    expect(m.updateCapacity).toHaveBeenCalledWith("c1", { projectId: "p1" }, expect.anything(), expect.anything())
  })

  it("capacity_has_no_free_text_note: a note field is refused", async () => {
    asRole(m, "po")
    expect((await projectCapacity.POST(jsonReq("POST", { userId: "u2", ...PERIOD, note: "通院のため" }), P)).status).toBe(400)
    expect((await projectCapacity.POST(jsonReq("POST", { userId: "u2", ...PERIOD, fte: 1.5 }), P)).status).toBe(400)
    expect(m.createAllocation).not.toHaveBeenCalled()
  })
})

describe("own FTE routes (canManageUserCapacity)", () => {
  beforeEach(() => Object.values(m).forEach((f) => f.mockReset()))

  it("user_capacity_allowed_for_self_section_manager_admin_only", async () => {
    m.listUserCapacity.mockResolvedValue([])
    m.sharesSectionAsManager.mockResolvedValue(false)
    m.authMock.mockResolvedValue(session("member", "u1"))
    expect((await userCapacity.GET(getReq(), U("u1"))).status).toBe(200) // self
    expect((await userCapacity.GET(getReq(), U("u2"))).status).toBe(403) // someone else
    m.authMock.mockResolvedValue(session("section_manager", "mgr"))
    expect((await userCapacity.GET(getReq(), U("u2"))).status).toBe(403) // other section
    m.sharesSectionAsManager.mockResolvedValue(true)
    expect((await userCapacity.GET(getReq(), U("u2"))).status).toBe(200) // own section
    m.authMock.mockResolvedValue(session("admin", "a"))
    m.sharesSectionAsManager.mockResolvedValue(false)
    expect((await userCapacity.GET(getReq(), U("u2"))).status).toBe(200)
  })

  it("po_cannot_set_user_level_capacity", async () => {
    // A PO is a plain "member" system role: no section-manager path, not the person.
    m.authMock.mockResolvedValue(session("member", "po-user"))
    m.sharesSectionAsManager.mockResolvedValue(false)
    expect((await userCapacity.POST(jsonReq("POST", PERIOD), U("u2"))).status).toBe(403)
    expect((await userCapacityRow.PATCH(jsonReq("PATCH", { ...PERIOD, version: 0 }), UC("u2"))).status).toBe(403)
    expect(m.createUserCapacity).not.toHaveBeenCalled()
  })

  it("the person edits their own rows, scoped to their own FTE", async () => {
    m.authMock.mockResolvedValue(session("member", "u1"))
    m.sharesSectionAsManager.mockResolvedValue(false)
    m.updateCapacity.mockResolvedValue({ id: "c1" })
    expect((await userCapacityRow.PATCH(jsonReq("PATCH", { ...PERIOD, version: 0 }), UC("u1"))).status).toBe(200)
    expect(m.updateCapacity).toHaveBeenCalledWith("c1", { userId: "u1", projectId: null }, expect.anything(), expect.anything())
  })
})

describe("member load and levelling", () => {
  beforeEach(() => Object.values(m).forEach((f) => f.mockReset()))

  it("member_cannot_see_others_load: a dev gets only their own row; PO / SM see all", async () => {
    m.memberLoad.mockResolvedValue([])
    asRole(m, "dev")
    const url = "http://localhost/api/projects/p1/plan/member-load?from=2026-11-02&to=2026-11-30"
    expect((await (await memberLoadRoute.GET(getReq(url), P)).json()).canViewOthers).toBe(false)
    expect(m.memberLoad).toHaveBeenLastCalledWith("p1", { userId: "user-1", canViewOthers: false }, { from: "2026-11-02", to: "2026-11-30" })
    asRole(m, "po")
    expect((await (await memberLoadRoute.GET(getReq(url), P)).json()).canViewOthers).toBe(true)
    expect((await memberLoadRoute.GET(getReq("http://localhost/api/projects/p1/plan/member-load?from=2026-01-01&to=2026-12-31"), P)).status).toBe(400)
  })

  it("levelling needs plan.write and plan.viewMemberLoad; the body is validated", async () => {
    asRole(m, "dev")
    expect((await levelRoute.POST(jsonReq("POST", { startDate: "2026-11-02", roleAssignments: {} }), P)).status).toBe(403)
    asRole(m, "po")
    m.levelProject.mockResolvedValue({ placements: [], before: [], after: [], moves: [], plannedEnd: null })
    expect((await levelRoute.POST(jsonReq("POST", { startDate: "2026-11-02", roleAssignments: { dev: ["u2"] } }), P)).status).toBe(200)
    expect((await levelRoute.POST(jsonReq("POST", { startDate: "soon", roleAssignments: {} }), P)).status).toBe(400)
    expect((await levelRoute.POST(jsonReq("POST", { startDate: "2026-11-02", roleAssignments: { "bad role!": ["u2"] } }), P)).status).toBe(400)
  })
})
