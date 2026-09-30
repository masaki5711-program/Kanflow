import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/plan-progress", async () => ({
  ...(await vi.importActual<typeof import("@/lib/plan-progress")>("@/lib/plan-progress")),
  applyPlanUpdates: vi.fn(async () => undefined),
}))
vi.mock("../plan.repository")

const repo = await import("../plan.repository")
const { applyPlanUpdates } = await import("@/lib/plan-progress")
const { withTransaction } = await import("@/services/_shared/db")
const { TX, DEFAULT_DB } = await import("@/services/__tests__/support")
const { planRow, day } = await import("./plan-fixtures")
const heal = await import("../plan.heal")

/** A parent whose stored roll-up is stale: its only child is done and ends later. */
const DRIFTED = [
  planRow({ id: "p", name: "Parent", plannedStart: day("2026-01-01"), plannedEnd: day("2026-01-01") }),
  planRow({ id: "c", parentId: "p", status: "done", progressPct: 100, plannedStart: day("2026-10-01"), plannedEnd: day("2026-10-04") }),
]

describe("plan.heal", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    heal.resetPlanHealDebounce()
    vi.mocked(repo.findLinkedPbisOfProject).mockResolvedValue([])
  })

  describe("computePlanHeal", () => {
    it("returns the healed rows and only the drifted fields", () => {
      const out = heal.computePlanHeal(DRIFTED, [])
      expect(out.capped).toBe(false)
      expect(out.updates).toEqual([{ id: "p", progressPct: 100, status: "done", plannedStart: day("2026-10-01"), plannedEnd: day("2026-10-04") }])
      expect(out.items.find((i) => i.id === "p")).toMatchObject({ status: "done", progressPct: 100, plannedEnd: day("2026-10-04"), name: "Parent" })
      expect(DRIFTED[0].status).toBe("not_started") // input not mutated
    })

    it("uses linked PBIs only for linked-mode items", () => {
      const rows = [planRow({ id: "l", progressMode: "linked" }), planRow({ id: "m" })]
      const pbis = [
        { planItemId: "l", status: "completed", workloadScore: 1, sprintItems: [] },
        { planItemId: "m", status: "completed", workloadScore: 1, sprintItems: [] },
      ]
      const out = heal.computePlanHeal(rows, pbis as never)
      expect(out.updates).toEqual([{ id: "l", progressPct: 100, status: "done" }])
    })

    it("skips (no updates) when the list hit its cap: a partial tree would roll up wrongly", async () => {
      const { LIST_LIMITS } = await import("@/services/_shared/limits")
      const many = Array.from({ length: LIST_LIMITS.planItems }, (_, i) => planRow({ id: `r${i}`, status: "done", progressPct: 0 }))
      const out = heal.computePlanHeal(many, [])
      expect(out.capped).toBe(true)
      expect(out.updates).toEqual([])
      expect(out.items[0].progressPct).toBe(0)
    })
  })

  describe("healProjectPlan", () => {
    it("reads the live tree and writes the drift in one transaction (versioning-free path)", async () => {
      vi.mocked(repo.findPlanItems).mockResolvedValue(DRIFTED as never)
      const out = await heal.healProjectPlan("p1")
      expect(repo.findPlanItems).toHaveBeenCalledWith(DEFAULT_DB, "p1")
      expect(repo.findLinkedPbisOfProject).toHaveBeenCalledWith(DEFAULT_DB, "p1")
      expect(withTransaction).toHaveBeenCalledTimes(1)
      expect(applyPlanUpdates).toHaveBeenCalledWith(TX, out.updates)
      expect(out).toMatchObject({ applied: true, capped: false })
      expect(out.updates).toHaveLength(1)
    })

    it("dry run (apply: false) and nothing drifted never write", async () => {
      vi.mocked(repo.findPlanItems).mockResolvedValue(DRIFTED as never)
      expect(await heal.healProjectPlan("p1", { apply: false })).toMatchObject({ applied: false })
      vi.mocked(repo.findPlanItems).mockResolvedValue([planRow({ id: "x" })] as never)
      expect(await heal.healProjectPlan("p1")).toMatchObject({ applied: false, updates: [] })
      expect(applyPlanUpdates).not.toHaveBeenCalled()
    })

    it("writes through a caller-provided client directly (no nested transaction)", async () => {
      const db = { tag: "worker-db" }
      vi.mocked(repo.findPlanItems).mockResolvedValue(DRIFTED as never)
      await heal.healProjectPlan("p1", { db: db as never })
      expect(repo.findPlanItems).toHaveBeenCalledWith(db, "p1")
      expect(withTransaction).not.toHaveBeenCalled()
      expect(applyPlanUpdates).toHaveBeenCalledWith(db, expect.any(Array))
    })

    it("propagates write failures to the caller", async () => {
      vi.mocked(repo.findPlanItems).mockResolvedValue(DRIFTED as never)
      vi.mocked(applyPlanUpdates).mockRejectedValueOnce(new Error("lock"))
      await expect(heal.healProjectPlan("p1")).rejects.toThrow("lock")
    })
  })

  describe("GET debounce", () => {
    it("claims a project once per window, re-arms after it and after a release", () => {
      const t0 = 1_000_000
      expect(heal.claimPlanHeal("p1", t0)).toBe(true)
      expect(heal.claimPlanHeal("p1", t0 + heal.PLAN_HEAL_DEBOUNCE_MS - 1)).toBe(false)
      expect(heal.claimPlanHeal("p2", t0)).toBe(true)
      expect(heal.claimPlanHeal("p1", t0 + heal.PLAN_HEAL_DEBOUNCE_MS)).toBe(true)
      heal.releasePlanHeal("p1")
      expect(heal.claimPlanHeal("p1", t0 + heal.PLAN_HEAL_DEBOUNCE_MS + 1)).toBe(true)
    })
  })

  it("describePlanHealUpdate lists the changed fields as from → to", () => {
    const [u] = heal.computePlanHeal(DRIFTED, []).updates
    expect(heal.describePlanHealUpdate(DRIFTED[0], u)).toBe(
      "Parent (p): progressPct 0 → 100, status not_started → done, plannedStart 2026-01-01 → 2026-10-01, plannedEnd 2026-01-01 → 2026-10-04"
    )
  })
})
