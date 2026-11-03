import { createHash } from "node:crypto"
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
const { canonicalJson } = await import("@/lib/plan-schedule/schedule-source")

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
    vi.mocked(planRepo.insertScheduleLoad).mockResolvedValue({ id: "load1" } as never)
    vi.mocked(planRepo.copyBaseline).mockResolvedValue(4)
    vi.mocked(planRepo.hasBaseline).mockResolvedValue(false)
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

  // === plan 12 E0: template keys, baseline and the load record ===

  it("load_stores_template_key_on_every_row", async () => {
    await loadBaseSchedule("p1", { startDate: "2026-11-02", schedule: SCHEDULE }, ACTOR)
    const rows = vi.mocked(planRepo.insertPlanItem).mock.calls.map((c) => c[1])
    // Parents and leaves alike carry the schedule item's key and the load they came from.
    expect(rows.map((r) => [r.name, r.templateKey, r.scheduleLoadId])).toEqual([
      ["仕様", "spec", "load1"],
      ["要求", "req", "load1"],
      ["見積", "rfq", "load1"],
      ["検収", "accept", "load1"],
    ])
  })

  it("load_sets_baseline_equal_to_planned: after the recalc derives the parents' spans, for every created row", async () => {
    await loadBaseSchedule("p1", { startDate: "2026-11-02", schedule: SCHEDULE }, ACTOR)
    expect(planRepo.copyBaseline).toHaveBeenCalledWith(TX, "p1", ["n1", "n2", "n3", "n4"])
    const recalcOrder = vi.mocked(recalcPlanProgress).mock.invocationCallOrder[0]
    const baselineOrder = vi.mocked(planRepo.copyBaseline).mock.invocationCallOrder[0]
    expect(baselineOrder).toBeGreaterThan(recalcOrder)
  })

  it("an impossible start date (2026-02-30) is a ValidationError and nothing is written", async () => {
    const err = await loadBaseSchedule("p1", { startDate: "2026-02-30", schedule: SCHEDULE }, ACTOR).catch((e) => e)
    expect(err).toBeInstanceOf(ValidationError)
    expect(planRepo.insertScheduleLoad).not.toHaveBeenCalled()
  })

  it("a project that already froze a baseline keeps it: the new rows get none (added scope shows as variance)", async () => {
    vi.mocked(planRepo.hasBaseline).mockResolvedValueOnce(true)
    const out = await loadBaseSchedule("p1", { startDate: "2026-11-02", schedule: SCHEDULE }, ACTOR)
    expect(planRepo.hasBaseline).toHaveBeenCalledWith(TX, "p1")
    expect(vi.mocked(planRepo.hasBaseline).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(planRepo.insertPlanItem).mock.invocationCallOrder[0])
    expect(planRepo.copyBaseline).not.toHaveBeenCalled()
    expect(out.baselineSet).toBe(false)
  })

  it("load_records_source_ref_and_hash: one load record before the rows, in the same transaction", async () => {
    const schedule = { ...SCHEDULE, skipWeekends: true }
    await loadBaseSchedule("p1", { startDate: "2026-11-02", schedule, proposalId: "prop_plan_x", sourceRef: "gitstation:equipment-spec@v1.2.0:schedule.yml" }, ACTOR)
    expect(planRepo.insertScheduleLoad).toHaveBeenCalledTimes(1)
    const [db, data] = vi.mocked(planRepo.insertScheduleLoad).mock.calls[0]
    expect(db).toBe(TX)
    expect(data).toMatchObject({
      projectId: "p1",
      proposalId: "prop_plan_x",
      sourceRef: "gitstation:equipment-spec@v1.2.0:schedule.yml",
      lineage: "gitstation:equipment-spec:schedule.yml",
      skipWeekends: true,
      loadedById: "u1",
      estimateRunId: null,
    })
    expect((data.startDate as Date).toISOString().slice(0, 10)).toBe("2026-11-02")
    expect(data.content).toEqual(schedule)
    expect(data.scheduleHash).toBe(createHash("sha256").update(canonicalJson(schedule)).digest("hex"))
    expect(vi.mocked(planRepo.insertScheduleLoad).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(planRepo.insertPlanItem).mock.invocationCallOrder[0])
  })

  it("the hash ignores key order (canonical JSON); an explicit lineage wins over the derived one", async () => {
    const reordered = { items: SCHEDULE.items.map((i) => Object.fromEntries(Object.entries(i).reverse())) } as typeof SCHEDULE
    await loadBaseSchedule("p1", { startDate: "2026-11-02", schedule: SCHEDULE }, ACTOR)
    await loadBaseSchedule("p1", { startDate: "2026-11-02", schedule: reordered, lineage: "設備導入の標準工程" }, ACTOR)
    const [a, b] = vi.mocked(planRepo.insertScheduleLoad).mock.calls.map((c) => c[1])
    expect(a.scheduleHash).toBe(b.scheduleHash)
    expect(a).toMatchObject({ sourceRef: null, proposalId: null, lineage: `schedule:${a.scheduleHash.slice(0, 16)}` })
    expect(b.lineage).toBe("設備導入の標準工程")
  })

  it("a concurrent second load of the same proposal (unique violation on the load record) is 409 PLAN_ALREADY_LOADED", async () => {
    vi.mocked(planRepo.insertScheduleLoad).mockRejectedValueOnce(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }))
    const err = await loadBaseSchedule("p1", { startDate: "2026-11-02", schedule: SCHEDULE, proposalId: "prop_plan_x" }, ACTOR).catch((e) => e)
    expect(err).toBeInstanceOf(ConflictError)
    expect(err.code ?? err.errorCode).toBe("PLAN_ALREADY_LOADED")
    expect(planRepo.insertPlanItem).not.toHaveBeenCalled()
  })
})
