import { beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  list: vi.fn(),
  recordAll: vi.fn(),
  approve: vi.fn(),
  withdraw: vi.fn(),
}))
vi.mock("@/lib/auth", () => ({ auth: () => m.auth() }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/services/plan-estimate-eval/admin.service", () => ({ listLineageEvals: m.list, approveLineage: m.approve, withdrawLineage: m.withdraw }))
vi.mock("@/services/plan-estimate-eval/eval.service", () => ({ recordAllLineages: m.recordAll }))

const route = await import("@/app/api/admin/plan-estimate-eval/route")
const approval = await import("@/app/api/admin/plan-estimate-eval/approval/route")

const OVERVIEW = { methodVersion: "e2-v1", conditions: { minProjects: 5, mapeRatio: 0.85, p80Range: [0.7, 0.9] }, lineages: [] }
const post = (body: unknown) => new Request("http://x/api/admin/plan-estimate-eval/approval", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } })

beforeEach(() => {
  vi.clearAllMocks()
  m.list.mockResolvedValue(OVERVIEW)
  m.recordAll.mockResolvedValue([])
})

describe("admin estimate eval routes (canManageEstimateGate)", () => {
  it("401 without a session, 403 for every non-admin; nothing is read or written", async () => {
    m.auth.mockResolvedValue(null)
    expect((await route.GET()).status).toBe(401)
    for (const role of ["member", "section_manager"]) {
      m.auth.mockResolvedValue({ user: { id: "u", role } })
      expect((await route.GET()).status).toBe(403)
      expect((await route.POST()).status).toBe(403)
      expect((await approval.POST(post({ decision: "withdraw", lineage: "template:x" }))).status).toBe(403)
    }
    expect(m.list).not.toHaveBeenCalled()
    expect(m.recordAll).not.toHaveBeenCalled()
    expect(m.approve).not.toHaveBeenCalled()
    expect(m.withdraw).not.toHaveBeenCalled()
  })

  it("GET lists; POST recomputes every lineage, then lists", async () => {
    m.auth.mockResolvedValue({ user: { id: "a", role: "admin" } })
    expect(await (await route.GET()).json()).toEqual(OVERVIEW)
    const res = await route.POST()
    expect(res.status).toBe(200)
    expect(m.recordAll).toHaveBeenCalledTimes(1)
    expect(await res.json()).toEqual(OVERVIEW)
  })

  it("approves the record the admin saw, as the admin; withdraws", async () => {
    m.auth.mockResolvedValue({ user: { id: "a", role: "admin" } })
    expect((await approval.POST(post({ decision: "approve", lineage: "template:x", evalId: "e1" }))).status).toBe(200)
    expect(m.approve).toHaveBeenCalledWith("template:x", "e1", "a")
    expect((await approval.POST(post({ decision: "withdraw", lineage: "template:x" }))).status).toBe(200)
    expect(m.withdraw).toHaveBeenCalledWith("template:x", "a")
  })

  it("400 for a body that is not one of the two decisions (approve needs the record id)", async () => {
    m.auth.mockResolvedValue({ user: { id: "a", role: "admin" } })
    expect((await approval.POST(post({ decision: "approve", lineage: "template:x" }))).status).toBe(400)
    expect((await approval.POST(post({ decision: "force", lineage: "template:x" }))).status).toBe(400)
    expect((await approval.POST(post({ decision: "withdraw", lineage: "" }))).status).toBe(400)
    expect(m.approve).not.toHaveBeenCalled()
  })

  it("a service refusal keeps its status and code", async () => {
    m.auth.mockResolvedValue({ user: { id: "a", role: "admin" } })
    const { ConflictError } = await import("@/services/_shared/errors")
    m.approve.mockRejectedValue(new ConflictError("新しくなっています", {}, "PLAN_ESTIMATE_EVAL_CHANGED"))
    const res = await approval.POST(post({ decision: "approve", lineage: "template:x", evalId: "old" }))
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe("PLAN_ESTIMATE_EVAL_CHANGED")
  })
})
