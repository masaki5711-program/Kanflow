import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/activity", async () => (await import("@/services/__tests__/support")).activityMock())
vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/plan-progress", async () => ({
  ...(await vi.importActual<typeof import("@/lib/plan-progress")>("@/lib/plan-progress")),
  recalcPlanProgress: vi.fn(async () => []),
}))
vi.mock("../plan.repository")

const repo = await import("../plan.repository")
const act = await import("@/services/_shared/activity")
const { recalcPlanProgress } = await import("@/lib/plan-progress")
const { ACTOR } = await import("@/services/__tests__/support")
const { planRow, day } = await import("./plan-fixtures")
const { shiftFollowing } = await import("../plan.shift")

const rows = () => [
  planRow({ id: "A", name: "A", plannedStart: day("2026-11-02"), plannedEnd: day("2026-11-06"), actualStart: day("2026-11-02"), actualEnd: day("2026-11-10") }),
  planRow({ id: "B", name: "B", plannedStart: day("2026-11-09"), plannedEnd: day("2026-11-13") }),
]

describe("plan.shift", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(repo.findPlanItems).mockResolvedValue(rows() as never)
    vi.mocked(repo.updatePlanItemVersioned).mockResolvedValue({} as never)
    vi.mocked(repo.findDependencies).mockResolvedValue([{ id: "d1", predecessorId: "A", successorId: "B" }] as never)
  })

  it("previews without writing: the slip comes from the actual end", async () => {
    const out = await shiftFollowing("p1", "A", { scope: "dependents", apply: false }, ACTOR)
    expect(out).toMatchObject({ deltaDays: 4, slipDays: 4, applied: false })
    expect(out.moved).toEqual([{ id: "B", name: "B", plannedStart: "2026-11-09", plannedEnd: "2026-11-13", newStart: "2026-11-13", newEnd: "2026-11-17" }])
    expect(repo.updatePlanItemVersioned).not.toHaveBeenCalled()
  })

  it("applies: writes the new dates, recalculates and logs once", async () => {
    const out = await shiftFollowing("p1", "A", { scope: "dependents", apply: true }, ACTOR)
    expect(out.applied).toBe(true)
    const call = vi.mocked(repo.updatePlanItemVersioned).mock.calls[0]
    expect(call[2]).toBe("B")
    expect(call[3]).toMatchObject({ plannedStart: day("2026-11-13"), plannedEnd: day("2026-11-17") })
    expect(recalcPlanProgress).toHaveBeenCalledOnce()
    expect(act.logActivity).toHaveBeenCalledOnce()
  })

  it("a deltaDays override wins over the computed slip", async () => {
    const out = await shiftFollowing("p1", "A", { scope: "dependents", apply: false, deltaDays: -1 }, ACTOR)
    expect(out.deltaDays).toBe(-1)
    expect(out.moved[0].newStart).toBe("2026-11-08")
  })

  it("404 for an item that is not in the plan", async () => {
    await expect(shiftFollowing("p1", "zzz", { scope: "later", apply: false }, ACTOR)).rejects.toMatchObject({ code: "PLAN_ITEM_NOT_FOUND" })
  })
})
