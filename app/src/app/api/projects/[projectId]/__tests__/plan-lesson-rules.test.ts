import { beforeEach, describe, expect, it, vi } from "vitest"
import { asRole, ctx, getReq, jsonReq, session } from "./a2-helpers"

const m = vi.hoisted(() => ({
  authMock: vi.fn(),
  memberFindFirst: vi.fn(),
  listProjectRules: vi.fn(),
  lessonRulePageContext: vi.fn(),
  createDraft: vi.fn(),
  updateDraft: vi.fn(),
  confirmRule: vi.fn(),
  retireRule: vi.fn(),
  requestPromotion: vi.fn(),
  listSharedAndRequested: vi.fn(),
  decidePromotion: vi.fn(),
  retireSharedRule: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({ auth: () => m.authMock() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectMember: { findFirst: (...a: unknown[]) => m.memberFindFirst(...a) },
    projectSection: { findFirst: vi.fn().mockResolvedValue(null) },
    project: { findFirst: vi.fn().mockResolvedValue({ id: "live" }) },
  },
}))
vi.mock("@/services/plan-lesson-rules/lesson-rules.service", () => ({
  listProjectRules: m.listProjectRules,
  lessonRulePageContext: m.lessonRulePageContext,
  createDraft: m.createDraft,
  updateDraft: m.updateDraft,
  confirmRule: m.confirmRule,
  retireRule: m.retireRule,
  requestPromotion: m.requestPromotion,
  listSharedAndRequested: m.listSharedAndRequested,
  decidePromotion: m.decidePromotion,
  retireSharedRule: m.retireSharedRule,
}))

const list = await import("../plan/lesson-rules/route")
const one = await import("../plan/lesson-rules/[ruleId]/route")
const confirm = await import("../plan/lesson-rules/[ruleId]/confirm/route")
const retire = await import("../plan/lesson-rules/[ruleId]/retire/route")
const promotion = await import("../plan/lesson-rules/[ruleId]/promotion/route")
const adminList = await import("../../../admin/plan-lesson-rules/route")
const adminPromotion = await import("../../../admin/plan-lesson-rules/[ruleId]/promotion/route")
const adminRetire = await import("../../../admin/plan-lesson-rules/[ruleId]/retire/route")
const { ConflictError } = await import("@/services/_shared/errors")

const P = ctx({ projectId: "p1" })
const R = ctx({ projectId: "p1", ruleId: "r1" })
const A = ctx({ ruleId: "r1" })
const RULE = { kind: "add_buffer", params: { afterKey: "spec", days: 3 } }

describe("project lesson-rule routes (plan 12 E3)", () => {
  beforeEach(() => Object.values(m).forEach((f) => f.mockReset()))

  it("GET needs project.view: a developer may list, an outsider gets 404", async () => {
    m.listProjectRules.mockResolvedValue([])
    m.lessonRulePageContext.mockResolvedValue({ projectType: "software", lineages: [], sprints: [] })
    asRole(m, "dev")
    const dev = await list.GET(getReq(), P)
    expect(dev.status).toBe(200)
    expect((await dev.json()).permissions).toEqual({ draft: false, confirm: false, requestPromotion: false })
    asRole(m, "sm")
    expect((await (await list.GET(getReq(), P)).json()).permissions).toEqual({ draft: true, confirm: true, requestPromotion: false })
    asRole(m, "outsider")
    expect((await list.GET(getReq(), P)).status).toBe(404)
  })

  it("drafting needs plan.write: dev 403, PO 201; unknown fields and kinds are 400 before the service", async () => {
    asRole(m, "dev")
    expect((await list.POST(jsonReq("POST", RULE), P)).status).toBe(403)
    asRole(m, "po")
    m.createDraft.mockResolvedValue({ id: "r1" })
    expect((await list.POST(jsonReq("POST", RULE), P)).status).toBe(201)
    expect(m.createDraft).toHaveBeenCalledWith("p1", RULE, expect.objectContaining({ userId: "user-1" }))
    m.createDraft.mockClear()
    expect((await list.POST(jsonReq("POST", { ...RULE, scope: "shared" }), P)).status).toBe(400)
    expect((await list.POST(jsonReq("POST", { kind: "rewrite", params: {} }), P)).status).toBe(400)
    expect((await list.POST(jsonReq("POST", { ...RULE, sourceBacklogItemIds: Array.from({ length: 51 }, (_, i) => `b${i}`) }), P)).status).toBe(400)
    expect(m.createDraft).not.toHaveBeenCalled()
  })

  it("editing a draft needs plan.write", async () => {
    asRole(m, "dev")
    expect((await one.PATCH(jsonReq("PATCH", { version: 0, ...RULE }), R)).status).toBe(403)
    asRole(m, "sm")
    m.updateDraft.mockResolvedValue({ id: "r1" })
    expect((await one.PATCH(jsonReq("PATCH", { version: 0, ...RULE }), R)).status).toBe(200)
  })

  it("plan.lessonRule.confirm: PO / SM allowed, dev denied; the body repeats the kind and numbers", async () => {
    asRole(m, "dev")
    expect((await confirm.POST(jsonReq("POST", { version: 0, ...RULE }), R)).status).toBe(403)
    asRole(m, "sm")
    expect((await confirm.POST(jsonReq("POST", { version: 0 }), R)).status).toBe(400)
    m.confirmRule.mockResolvedValue({ id: "r1", state: "confirmed" })
    expect((await confirm.POST(jsonReq("POST", { version: 0, ...RULE }), R)).status).toBe(200)
    expect(m.confirmRule).toHaveBeenCalledWith("p1", "r1", { version: 0, ...RULE }, expect.anything())
    m.confirmRule.mockRejectedValue(new ConflictError("changed", {}, "PLAN_RULE_CHANGED"))
    const res = await confirm.POST(jsonReq("POST", { version: 0, ...RULE }), R)
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe("PLAN_RULE_CHANGED")
  })

  it("there is no bulk confirm: an array body is refused", async () => {
    asRole(m, "po")
    expect((await confirm.POST(jsonReq("POST", [{ version: 0, ...RULE }]), R)).status).toBe(400)
    expect(m.confirmRule).not.toHaveBeenCalled()
  })

  it("retire needs plan.lessonRule.confirm", async () => {
    asRole(m, "dev")
    expect((await retire.POST(jsonReq("POST", { version: 1 }), R)).status).toBe(403)
    asRole(m, "po")
    m.retireRule.mockResolvedValue({ id: "r1", state: "retired" })
    expect((await retire.POST(jsonReq("POST", { version: 1 }), R)).status).toBe(200)
  })

  it("promotion request: PO only (SM and dev denied), at least one filter", async () => {
    asRole(m, "sm")
    expect((await promotion.POST(jsonReq("POST", { version: 1, lineage: "line-A" }), R)).status).toBe(403)
    asRole(m, "dev")
    expect((await promotion.POST(jsonReq("POST", { version: 1, lineage: "line-A" }), R)).status).toBe(403)
    asRole(m, "po")
    expect((await promotion.POST(jsonReq("POST", { version: 1 }), R)).status).toBe(400)
    m.requestPromotion.mockResolvedValue({ id: "r1" })
    expect((await promotion.POST(jsonReq("POST", { version: 1, lineage: "line-A" }), R)).status).toBe(200)
  })
})

describe("admin lesson-rule routes: lineage_rule_confirm_admin_only", () => {
  beforeEach(() => Object.values(m).forEach((f) => f.mockReset()))

  it.each(["member", "section_manager"])("a %s (incl. a PO / SM of the source project) gets 403", async (role) => {
    m.authMock.mockResolvedValue(session(role))
    expect((await adminList.GET()).status).toBe(403)
    expect((await adminPromotion.POST(jsonReq("POST", { decision: "confirm", version: 1, ...RULE }), A)).status).toBe(403)
    expect((await adminRetire.POST(jsonReq("POST", { version: 1 }), A)).status).toBe(403)
    expect(m.decidePromotion).not.toHaveBeenCalled()
    expect(m.retireSharedRule).not.toHaveBeenCalled()
  })

  it("no session → 401", async () => {
    m.authMock.mockResolvedValue(null)
    expect((await adminList.GET()).status).toBe(401)
  })

  it("an admin lists, decides (confirm repeats the numbers) and retires", async () => {
    m.authMock.mockResolvedValue(session("admin"))
    m.listSharedAndRequested.mockResolvedValue([])
    expect((await adminList.GET()).status).toBe(200)
    m.decidePromotion.mockResolvedValue({ id: "r1", scope: "shared" })
    expect((await adminPromotion.POST(jsonReq("POST", { decision: "confirm", version: 1 }), A)).status).toBe(400)
    expect((await adminPromotion.POST(jsonReq("POST", { decision: "confirm", version: 1, ...RULE }), A)).status).toBe(400)
    expect((await adminPromotion.POST(jsonReq("POST", { decision: "confirm", version: 1, ...RULE, lineage: "template:t1", projectType: null }), A)).status).toBe(200)
    expect((await adminPromotion.POST(jsonReq("POST", { decision: "reject", version: 2 }), A)).status).toBe(200)
    m.retireSharedRule.mockResolvedValue({ id: "r1", state: "retired" })
    expect((await adminRetire.POST(jsonReq("POST", { version: 3 }), A)).status).toBe(200)
  })
})
