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
const { reflowPlan } = await import("../plan.reflow")

const rows = () => [
  planRow({ id: "A", name: "A", plannedStart: day("2026-11-02"), plannedEnd: day("2026-11-06") }),
  planRow({ id: "B", name: "B", plannedStart: day("2026-11-06"), plannedEnd: day("2026-11-10"), version: 3 }),
  planRow({ id: "T", name: "Linked to trash", plannedStart: day("2026-11-02"), plannedEnd: day("2026-11-03") }),
]

describe("plan.reflow", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(repo.findPlanItems).mockResolvedValue(rows() as never)
    vi.mocked(repo.updatePlanItemVersioned).mockResolvedValue({} as never)
    vi.mocked(repo.findDependencies).mockResolvedValue([
      { id: "d1", predecessorId: "A", successorId: "B" },
      { id: "d2", predecessorId: "gone", successorId: "T" },
    ] as never)
  })

  it("previews without writing", async () => {
    const out = await reflowPlan("p1", { apply: false }, ACTOR)
    expect(out.applied).toBe(false)
    expect(out.moved).toEqual([{ id: "B", name: "B", plannedStart: "2026-11-06", plannedEnd: "2026-11-10", newStart: "2026-11-07", newEnd: "2026-11-11" }])
    expect(repo.updatePlanItemVersioned).not.toHaveBeenCalled()
  })

  it("applies with versioned writes, recalculates and logs once", async () => {
    const out = await reflowPlan("p1", { apply: true, businessDays: true }, ACTOR)
    expect(out.applied).toBe(true)
    const call = vi.mocked(repo.updatePlanItemVersioned).mock.calls[0]
    expect(call[2]).toBe("B")
    expect(call[3]).toMatchObject({ plannedStart: day("2026-11-09"), plannedEnd: day("2026-11-13") })
    expect(call[4]).toBe(3)
    expect(recalcPlanProgress).toHaveBeenCalledOnce()
    expect(act.logActivity).toHaveBeenCalledOnce()
  })

  it("is a no-op (not applied) when nothing violates", async () => {
    vi.mocked(repo.findDependencies).mockResolvedValue([])
    const out = await reflowPlan("p1", { apply: true }, ACTOR)
    expect(out).toEqual({ applied: false, moved: [], skipped: [] })
    expect(act.logActivity).not.toHaveBeenCalled()
  })

  it("409 when a row changed since the snapshot", async () => {
    vi.mocked(repo.updatePlanItemVersioned).mockResolvedValue(null as never)
    await expect(reflowPlan("p1", { apply: true }, ACTOR)).rejects.toMatchObject({ status: 409 })
  })
})
