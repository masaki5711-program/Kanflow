import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/activity", async () => (await import("@/services/__tests__/support")).activityMock())
vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/services/_shared/translations", async () => (await import("@/services/__tests__/support")).translationMock())
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/plan-progress", async () => ({
  ...(await vi.importActual<typeof import("@/lib/plan-progress")>("@/lib/plan-progress")),
  recalcPlanProgress: vi.fn(async () => []),
}))
vi.mock("../plan.repository")

const planRepo = await import("../plan.repository")
const act = await import("@/services/_shared/activity")
const { recalcPlanProgress } = await import("@/lib/plan-progress")
const { ValidationError, ConflictError } = await import("@/services/_shared/errors")
const { ACTOR, TX } = await import("@/services/__tests__/support")
const { planRow } = await import("./plan-fixtures")
const { loadBaseSchedule } = await import("../plan.base-schedule")

const SCHEDULE = {
  items: [
    { key: "spec", name: "仕様", children: [{ key: "req", name: "要求", durationDays: 5 }, { key: "rfq", name: "見積", durationDays: 3, dependsOn: ["req"] }] },
    { key: "accept", name: "検収", durationDays: 1, milestone: true, dependsOn: ["rfq"] },
  ],
}

describe("loadBaseSchedule", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    let n = 0
    vi.mocked(planRepo.insertPlanItem).mockImplementation((async (_db: unknown, data: object) => ({ ...planRow(), ...data, id: `n${++n}` })) as never)
    vi.mocked(planRepo.nextPlanSortOrder).mockResolvedValue(7)
    vi.mocked(planRepo.insertDependency).mockResolvedValue({ id: "d", predecessorId: "", successorId: "" })
  })

  it("inserts parents first with dated leaves, dependencies and one recalculation in one transaction", async () => {
    const out = await loadBaseSchedule("p1", { startDate: "2026-11-02", schedule: SCHEDULE }, ACTOR)
    const rows = vi.mocked(planRepo.insertPlanItem).mock.calls.map((c) => c[1])
    expect(rows.map((r) => [r.name, r.parentId, r.sortOrder])).toEqual([["仕様", null, 7], ["要求", "n1", 1], ["見積", "n1", 2], ["検収", null, 8]])
    const dates = (name: string) => rows.filter((r) => r.name === name).map((r) => [(r.plannedStart as Date).toISOString().slice(0, 10), (r.plannedEnd as Date).toISOString().slice(0, 10)])[0]
    expect(dates("要求")).toEqual(["2026-11-02", "2026-11-06"])
    expect(dates("見積")).toEqual(["2026-11-07", "2026-11-09"])
    expect(rows[0]).toMatchObject({ plannedStart: null, plannedEnd: null }) // parent: derived by the recalc
    expect(rows[3]).toMatchObject({ isMilestone: true, projectId: "p1", status: "not_started" })
    expect(vi.mocked(planRepo.insertDependency).mock.calls.map((c) => [c[1].predecessorId, c[1].successorId])).toEqual([["n2", "n3"], ["n3", "n4"]])
    expect(recalcPlanProgress).toHaveBeenCalledWith("p1", ["n1", "n2", "n3", "n4"], TX)
    expect(act.logActivity).toHaveBeenCalledTimes(1)
    expect(out).toMatchObject({ createdCount: 4, dependencyCount: 2, rootIds: ["n1", "n4"], plannedStart: "2026-11-02", plannedEnd: "2026-11-10" })
  })

  it("a proposalId loads once: a marker is written with the load; a second load is 409 PLAN_ALREADY_LOADED and writes nothing", async () => {
    vi.mocked(planRepo.findPlanLoadMarker).mockResolvedValueOnce(null as never)
    await loadBaseSchedule("p1", { startDate: "2026-11-02", schedule: SCHEDULE, proposalId: "prop_plan_x" }, ACTOR)
    expect(planRepo.insertPlanLoadMarker).toHaveBeenCalledWith(TX, expect.objectContaining({ projectId: "p1", proposalId: "prop_plan_x", actorId: "u1" }))
    vi.clearAllMocks()
    vi.mocked(planRepo.findPlanLoadMarker).mockResolvedValueOnce({ id: "m1" } as never)
    const err = await loadBaseSchedule("p1", { startDate: "2026-11-02", schedule: SCHEDULE, proposalId: "prop_plan_x" }, ACTOR).catch((e) => e)
    expect(err).toBeInstanceOf(ConflictError)
    expect(err.code ?? err.errorCode).toBe("PLAN_ALREADY_LOADED")
    expect(planRepo.insertPlanItem).not.toHaveBeenCalled()
    expect(planRepo.insertPlanLoadMarker).not.toHaveBeenCalled()
  })

  it("an invalid schedule is a 422-style ValidationError with the schedule code and nothing is written", async () => {
    const cyc = { items: [{ key: "a", name: "a", dependsOn: ["b"] }, { key: "b", name: "b", dependsOn: ["a"] }] }
    await expect(loadBaseSchedule("p1", { startDate: "2026-11-02", schedule: cyc }, ACTOR)).rejects.toBeInstanceOf(ValidationError)
    expect(planRepo.insertPlanItem).not.toHaveBeenCalled()
  })
})
