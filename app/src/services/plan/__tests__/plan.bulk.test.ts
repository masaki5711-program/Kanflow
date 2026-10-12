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
const db = await import("@/services/_shared/db")
const { recalcPlanProgress } = await import("@/lib/plan-progress")
const { ACTOR } = await import("@/services/__tests__/support")
const { planRow, day } = await import("./plan-fixtures")
const { bulkEditPlan } = await import("../plan.bulk")

const rows = () => [
  planRow({ id: "P", name: "Parent", plannedStart: day("2026-11-02"), plannedEnd: day("2026-11-13") }),
  planRow({ id: "a", name: "a", parentId: "P", plannedStart: day("2026-11-02"), plannedEnd: day("2026-11-06"), version: 2 }),
  planRow({ id: "b", name: "b", parentId: "P", plannedStart: day("2026-11-09"), plannedEnd: day("2026-11-13"), status: "done" }),
  planRow({ id: "u", name: "u", plannedStart: null, plannedEnd: null }),
  planRow({ id: "m", name: "m", plannedStart: day("2026-11-20"), plannedEnd: day("2026-11-20"), isMilestone: true }),
  planRow({ id: "s", name: "s", plannedStart: day("2026-11-24"), plannedEnd: day("2026-11-25"), actualStart: day("2026-11-24") }),
  planRow({ id: "l", name: "l", plannedStart: day("2026-12-01"), plannedEnd: day("2026-12-02"), progressMode: "linked" }),
]

describe("plan.bulk", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(repo.findPlanItems).mockResolvedValue(rows() as never)
    vi.mocked(repo.findDependencies).mockResolvedValue([])
    vi.mocked(repo.updatePlanItemVersioned).mockResolvedValue({} as never)
    vi.mocked(repo.findLinkedPbisOfProject).mockResolvedValue([{ planItemId: "l" }] as never)
    vi.mocked(repo.isProjectMember).mockResolvedValue(true)
  })

  describe("shift", () => {
    it("expands a parent to its leaves, skips done / undated, previews without writing", async () => {
      const out = await bulkEditPlan("p1", { target: { ids: ["P", "u", "nope"] }, op: { type: "shift", days: 7 }, apply: false }, ACTOR)
      expect(out.applied).toBe(false)
      expect(out.moved).toEqual([{ id: "a", name: "a", plannedStart: "2026-11-02", plannedEnd: "2026-11-06", newStart: "2026-11-09", newEnd: "2026-11-13" }])
      expect(out.skipped).toEqual([
        { id: "nope", name: "", reason: "not_found" },
        { id: "b", name: "b", reason: "done" },
        { id: "u", name: "u", reason: "undated" },
      ])
      expect(repo.updatePlanItemVersioned).not.toHaveBeenCalled()
    })

    it("applies versioned writes, recalculates and logs once; a milestone keeps start = end", async () => {
      const out = await bulkEditPlan("p1", { target: { ids: ["a", "m"] }, op: { type: "shift", days: -1, businessDays: true }, apply: true }, ACTOR)
      expect(out.applied).toBe(true)
      expect(out.updated).toBe(2)
      const calls = vi.mocked(repo.updatePlanItemVersioned).mock.calls
      expect(calls[0][3]).toMatchObject({ plannedStart: day("2026-10-30"), plannedEnd: day("2026-11-05") })
      expect(calls[0][4]).toBe(2)
      expect(calls[1][3]).toMatchObject({ plannedStart: day("2026-11-19"), plannedEnd: day("2026-11-19") })
      expect(act.logActivity).toHaveBeenCalledOnce()
    })

    it("fromDate moves only later, unstarted, unfinished leaves", async () => {
      const out = await bulkEditPlan("p1", { target: { fromDate: "2026-11-09" }, op: { type: "shift", days: 1 }, apply: false }, ACTOR)
      expect(out.moved.map((m) => m.id)).toEqual(["m", "l"])
      expect(out.skipped).toEqual([])
    })

    it("skips started leaves for an ids target too", async () => {
      const out = await bulkEditPlan("p1", { target: { ids: ["s"] }, op: { type: "shift", days: 1 }, apply: false }, ACTOR)
      expect(out.moved).toEqual([])
      expect(out.skipped).toEqual([{ id: "s", name: "s", reason: "started" }])
    })

    it("409 when a row changed since the snapshot", async () => {
      vi.mocked(repo.updatePlanItemVersioned).mockResolvedValue(null as never)
      await expect(bulkEditPlan("p1", { target: { ids: ["a"] }, op: { type: "shift", days: 1 }, apply: true }, ACTOR)).rejects.toMatchObject({ status: 409 })
    })
  })

  describe("owner / status", () => {
    const patches = () => vi.mocked(repo.updatePlanItemVersioned).mock.calls.map((c) => [c[2], c[3], c[4]])

    it("owner: sets every id (parents included) in one transaction with the snapshot versions, counting only changes", async () => {
      const out = await bulkEditPlan("p1", { target: { ids: ["P", "a", "x"] }, op: { type: "owner", ownerId: "u2" }, apply: true }, ACTOR)
      expect(out).toMatchObject({ applied: true, updated: 2, moved: [], skipped: [{ id: "x", reason: "not_found" }] })
      expect(patches()).toEqual([["P", { ownerId: "u2" }, 0], ["a", { ownerId: "u2" }, 2]])
      expect(db.withTransaction).toHaveBeenCalledOnce()
    })

    it("owner: 400 for a non-member, nothing written", async () => {
      vi.mocked(repo.isProjectMember).mockResolvedValue(false)
      await expect(bulkEditPlan("p1", { target: { ids: ["a"] }, op: { type: "owner", ownerId: "ghost" }, apply: true }, ACTOR)).rejects.toMatchObject({ code: "PLAN_OWNER_NOT_MEMBER" })
      expect(repo.updatePlanItemVersioned).not.toHaveBeenCalled()
    })

    it("a stale row aborts the whole batch with 409", async () => {
      vi.mocked(repo.updatePlanItemVersioned).mockResolvedValueOnce({} as never).mockResolvedValueOnce(null as never)
      await expect(bulkEditPlan("p1", { target: { ids: ["P", "a"] }, op: { type: "owner", ownerId: "u2" }, apply: true }, ACTOR)).rejects.toMatchObject({ status: 409 })
    })

    it("status: skips parents and linked leaves with PBIs as derived; preview writes nothing", async () => {
      const out = await bulkEditPlan("p1", { target: { ids: ["P", "a", "l"] }, op: { type: "status", status: "in_progress" }, apply: false }, ACTOR)
      expect(out).toMatchObject({ applied: false, updated: 1 })
      expect(out.skipped).toEqual([
        { id: "P", name: "Parent", reason: "derived" },
        { id: "l", name: "l", reason: "derived" },
      ])
      expect(repo.updatePlanItemVersioned).not.toHaveBeenCalled()
    })

    it("status: applies to the changed leaves only, then recalculates progress", async () => {
      await bulkEditPlan("p1", { target: { ids: ["a", "b"] }, op: { type: "status", status: "done" }, apply: true }, ACTOR)
      expect(patches()).toEqual([["a", { status: "done" }, 2]])
      expect(recalcPlanProgress).toHaveBeenCalledOnce()
    })

    it("fromDate is capped", async () => {
      const many = Array.from({ length: 501 }, (_, i) => planRow({ id: `k${i}`, plannedStart: day("2026-12-01"), plannedEnd: day("2026-12-02") }))
      vi.mocked(repo.findPlanItems).mockResolvedValue(many as never)
      await expect(bulkEditPlan("p1", { target: { fromDate: "2026-11-01" }, op: { type: "owner", ownerId: null }, apply: false }, ACTOR)).rejects.toMatchObject({ status: 400 })
    })
  })
})
