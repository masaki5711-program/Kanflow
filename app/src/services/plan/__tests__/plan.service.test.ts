import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/activity", async () => (await import("@/services/__tests__/support")).activityMock())
vi.mock("@/services/_shared/notifications", async () => (await import("@/services/__tests__/support")).notificationsMock())
vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/services/_shared/translations", async () => (await import("@/services/__tests__/support")).translationMock())
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/plan-progress", async () => ({
  ...(await vi.importActual<typeof import("@/lib/plan-progress")>("@/lib/plan-progress")),
  recalcPlanProgress: vi.fn(async () => []),
  applyPlanUpdates: vi.fn(async () => undefined),
}))
vi.mock("../plan.repository")

const repo = await import("../plan.repository")
const tr = await import("@/services/_shared/translations")
const act = await import("@/services/_shared/activity")
const { recalcPlanProgress, applyPlanUpdates } = await import("@/lib/plan-progress")
const { ACTOR, TX, DEFAULT_DB } = await import("@/services/__tests__/support")
const { planRow, day } = await import("./plan-fixtures")
const svc = await import("../plan.service")
const { resetPlanHealDebounce, PLAN_HEAL_DEBOUNCE_MS } = await import("../plan.heal")

const NOW = new Date("2026-10-05T03:00:00Z") // Tokyo 2026-10-05 12:00

const TREE = [
  { id: "root", parentId: null },
  { id: "a", parentId: "root" },
  { id: "a1", parentId: "a" },
  { id: "b", parentId: "root" },
]

function liveItem(row = planRow()) {
  vi.mocked(repo.findPlanItem).mockResolvedValue(row as never)
  return row
}

describe("plan.service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetPlanHealDebounce()
    vi.mocked(repo.findPlanTree).mockResolvedValue(TREE)
    vi.mocked(repo.countPlanChildren).mockResolvedValue(0)
    vi.mocked(repo.findLinkedPbisOfItem).mockResolvedValue([])
    vi.mocked(repo.isProjectMember).mockResolvedValue(true)
  })

  describe("listPlan", () => {
    it("returns { items, dependencies, today } with computed fields and heals drifted rows", async () => {
      vi.mocked(repo.findPlanItems).mockResolvedValue([
        planRow({ id: "p", plannedStart: day("2026-01-01"), plannedEnd: day("2026-01-01") }),
        planRow({ id: "c", parentId: "p", status: "done", progressPct: 100, plannedStart: day("2026-10-01"), plannedEnd: day("2026-10-04") }),
        planRow({ id: "l", progressMode: "linked", plannedEnd: day("2026-10-03"), baselineEnd: day("2026-10-01") }),
      ] as never)
      vi.mocked(repo.findLinkedPbisOfProject).mockResolvedValue([
        { planItemId: "l", status: "completed", workloadScore: 1, sprintItems: [] },
        {
          planItemId: "l",
          status: "ready",
          workloadScore: 3,
          sprintItems: [{ sprint: { id: "s1", sprintName: "S1", startDate: day("2026-10-01"), endDate: day("2026-10-14"), status: "active" } }],
        },
      ] as never)
      vi.mocked(repo.findDependencies).mockResolvedValue([
        { id: "d1", predecessorId: "c", successorId: "l" },
        { id: "d2", predecessorId: "c", successorId: "trashed" },
      ])

      const out = await svc.listPlan("p1", NOW)

      expect(out.today).toBe("2026-10-05")
      expect(out.dependencies).toEqual([{ id: "d1", predecessorId: "c", successorId: "l" }])
      const byId = new Map(out.items.map((i) => [i.id, i]))
      expect(byId.get("p")).toMatchObject({
        hasChildren: true,
        linked: null,
        progressPct: 100,
        status: "done",
        plannedStart: "2026-10-01",
        plannedEnd: "2026-10-04",
        scheduleState: "done",
      })
      expect(byId.get("l")).toMatchObject({
        progressMode: "linked",
        progressPct: 25,
        status: "in_progress",
        scheduleState: "delayed",
        baselineEnd: "2026-10-01",
        baselineVarianceDays: 2,
        linked: { pbiCount: 2, pbiDone: 1, pointsTotal: 4, pointsDone: 1, sprints: [{ id: "s1", name: "S1", startDate: "2026-10-01", endDate: "2026-10-14", status: "active" }] },
      })
      expect(applyPlanUpdates).toHaveBeenCalledWith(TX, expect.arrayContaining([expect.objectContaining({ id: "p", progressPct: 100, status: "done" })]))
    })

    it("does not write when nothing drifted and still answers when the heal write fails", async () => {
      vi.mocked(repo.findPlanItems).mockResolvedValue([planRow({ id: "x" })] as never)
      vi.mocked(repo.findLinkedPbisOfProject).mockResolvedValue([])
      vi.mocked(repo.findDependencies).mockResolvedValue([])
      await svc.listPlan("p1", NOW)
      expect(applyPlanUpdates).not.toHaveBeenCalled()

      vi.mocked(repo.findPlanItems).mockResolvedValue([planRow({ id: "x", status: "done", progressPct: 0 })] as never)
      vi.mocked(applyPlanUpdates).mockRejectedValueOnce(new Error("lock"))
      const out = await svc.listPlan("p1", NOW)
      expect(out.items[0]).toMatchObject({ progressPct: 100, scheduleState: "done" })
    })

    it("debounces the heal write per project (60 s) but always answers healed values", async () => {
      vi.mocked(repo.findPlanItems).mockResolvedValue([planRow({ id: "x", status: "done", progressPct: 0 })] as never)
      vi.mocked(repo.findLinkedPbisOfProject).mockResolvedValue([])
      vi.mocked(repo.findDependencies).mockResolvedValue([])

      await svc.listPlan("p1", NOW)
      const again = await svc.listPlan("p1", new Date(NOW.getTime() + PLAN_HEAL_DEBOUNCE_MS - 1))
      expect(applyPlanUpdates).toHaveBeenCalledTimes(1)
      expect(again.items[0]).toMatchObject({ progressPct: 100 })

      await svc.listPlan("p2", NOW)
      expect(applyPlanUpdates).toHaveBeenCalledTimes(2)
      await svc.listPlan("p1", new Date(NOW.getTime() + PLAN_HEAL_DEBOUNCE_MS))
      expect(applyPlanUpdates).toHaveBeenCalledTimes(3)
    })

    it("a failed heal write does not arm the debounce (the next GET retries)", async () => {
      vi.mocked(repo.findPlanItems).mockResolvedValue([planRow({ id: "x", status: "done", progressPct: 0 })] as never)
      vi.mocked(repo.findLinkedPbisOfProject).mockResolvedValue([])
      vi.mocked(repo.findDependencies).mockResolvedValue([])
      vi.mocked(applyPlanUpdates).mockRejectedValueOnce(new Error("lock"))
      await svc.listPlan("p1", NOW)
      await svc.listPlan("p1", NOW)
      expect(applyPlanUpdates).toHaveBeenCalledTimes(2)
    })
  })

  describe("createPlanItem", () => {
    it("creates under a live parent, normalizes dates, recalculates and returns the DTO", async () => {
      liveItem(planRow({ id: "n", parentId: "root" }))
      vi.mocked(repo.nextPlanSortOrder).mockResolvedValue(3)
      vi.mocked(repo.insertPlanItem).mockResolvedValue(planRow({ id: "n", parentId: "root" }) as never)
      const input = { name: "N", plannedStart: "2026-01-01", plannedEnd: "2026-02-01T00:00:00+09:00", parentId: "root", status: "done" as const, ownerId: "u2" }
      const dto = await svc.createPlanItem("p1", input, ACTOR, NOW)
      expect(repo.insertPlanItem).toHaveBeenCalledWith(TX, expect.objectContaining({
        progressPct: 100,
        sortOrder: 3,
        plannedStart: day("2026-01-01"),
        plannedEnd: day("2026-02-01"),
        progressMode: "manual",
        ownerId: "u2",
      }))
      expect(repo.isProjectMember).toHaveBeenCalledWith(TX, "p1", "u2")
      expect(recalcPlanProgress).toHaveBeenCalledWith("p1", ["n"], TX)
      expect(tr.enqueueIn).toHaveBeenCalledWith(TX, "plan_item", "n", expect.objectContaining({ id: "n" }))
      expect(dto).toMatchObject({ id: "n", plannedStart: "2026-10-01", version: 0, hasChildren: false, linked: null })
    })

    it("a milestone is one day (start = end)", async () => {
      vi.mocked(repo.insertPlanItem).mockResolvedValue(planRow({ id: "m" }) as never)
      liveItem(planRow({ id: "m" }))
      await svc.createPlanItem("p1", { name: "M", plannedStart: "2026-01-01", plannedEnd: "2026-01-05", isMilestone: true }, ACTOR, NOW)
      expect(repo.insertPlanItem).toHaveBeenCalledWith(TX, expect.objectContaining({ plannedStart: day("2026-01-05"), plannedEnd: day("2026-01-05") }))
    })

    it("rejects bad dates, inverted ranges, unknown parents and non-member owners", async () => {
      await expect(svc.createPlanItem("p1", { name: "N", plannedStart: "x", plannedEnd: "y" }, ACTOR)).rejects.toMatchObject({ code: "INVALID_DATE" })
      await expect(svc.createPlanItem("p1", { name: "N", plannedStart: "2026-02-01", plannedEnd: "2026-01-01" }, ACTOR)).rejects.toMatchObject({
        status: 400,
        code: "PLAN_INVALID_RANGE",
      })
      vi.mocked(repo.findPlanItem).mockResolvedValue(null)
      await expect(svc.createPlanItem("p1", { name: "N", plannedStart: "2026-01-01", plannedEnd: "2026-01-02", parentId: "zz" }, ACTOR)).rejects.toMatchObject({
        code: "PLAN_PARENT_NOT_FOUND",
      })
      vi.mocked(repo.isProjectMember).mockResolvedValue(false)
      await expect(svc.createPlanItem("p1", { name: "N", plannedStart: "2026-01-01", plannedEnd: "2026-01-02", ownerId: "stranger" }, ACTOR)).rejects.toMatchObject({
        code: "PLAN_OWNER_NOT_MEMBER",
      })
      expect(repo.insertPlanItem).not.toHaveBeenCalled()
    })
  })

  describe("updatePlanItem", () => {
    it("guards against self-parenting, foreign parents and cycles", async () => {
      liveItem(planRow({ id: "a", parentId: "root" }))
      await expect(svc.updatePlanItem("p1", "a", { parentId: "a" }, ACTOR)).rejects.toMatchObject({ code: "PLAN_SELF_PARENT" })
      await expect(svc.updatePlanItem("p1", "a", { parentId: "a1" }, ACTOR)).rejects.toMatchObject({ code: "PLAN_CYCLE" })
      await expect(svc.updatePlanItem("p1", "a", { parentId: "elsewhere" }, ACTOR)).rejects.toMatchObject({ code: "PLAN_PARENT_NOT_FOUND" })
      expect(repo.updatePlanItemVersioned).not.toHaveBeenCalled()
    })

    it("404 PLAN_ITEM_NOT_FOUND for unknown / trashed items", async () => {
      vi.mocked(repo.findPlanItem).mockResolvedValue(null)
      await expect(svc.updatePlanItem("p1", "x", { name: "n" }, ACTOR)).rejects.toMatchObject({ status: 404, code: "PLAN_ITEM_NOT_FOUND" })
    })

    it("409 VERSION_CONFLICT with the current DTO for a stale version", async () => {
      liveItem(planRow({ id: "a", version: 3 }))
      await expect(svc.updatePlanItem("p1", "a", { name: "n", version: 2 }, ACTOR, NOW)).rejects.toMatchObject({
        status: 409,
        code: "VERSION_CONFLICT",
        current: expect.objectContaining({ id: "a", version: 3 }),
      })
      expect(repo.updatePlanItemVersioned).not.toHaveBeenCalled()
    })

    it("409 when the compare-and-set loses a race", async () => {
      liveItem(planRow({ id: "a", version: 2 }))
      vi.mocked(repo.updatePlanItemVersioned).mockResolvedValue(null)
      await expect(svc.updatePlanItem("p1", "a", { name: "n", version: 2 }, ACTOR, NOW)).rejects.toMatchObject({ code: "VERSION_CONFLICT" })
    })

    it("400 PLAN_PARENT_DATES_DERIVED when moving a parent's dates", async () => {
      liveItem(planRow({ id: "root" }))
      vi.mocked(repo.countPlanChildren).mockResolvedValue(2)
      await expect(svc.updatePlanItem("p1", "root", { plannedEnd: "2026-12-31" }, ACTOR)).rejects.toMatchObject({ code: "PLAN_PARENT_DATES_DERIVED" })
    })

    it("writes with the version, reparents and rebalances the item and old + new ancestors", async () => {
      const row = liveItem(planRow({ id: "a1", parentId: "a", version: 4 }))
      vi.mocked(repo.updatePlanItemVersioned).mockResolvedValue({ ...row, parentId: "b", version: 5 } as never)
      await svc.updatePlanItem("p1", "a1", { parentId: "b", status: "done", version: 4, progressMode: "linked" }, ACTOR, NOW)
      expect(repo.updatePlanItemVersioned).toHaveBeenCalledWith(TX, "p1", "a1", { parentId: "b", status: "done", progressMode: "linked" }, 4)
      expect(recalcPlanProgress).toHaveBeenCalledWith("p1", ["a1", "a", "b"], TX)
      expect(tr.enqueueIn).toHaveBeenCalledWith(TX, "plan_item", "a1", { parentId: "b", status: "done", progressMode: "linked" })
      expect(act.logUpdate).toHaveBeenCalledWith(TX, expect.objectContaining({ entityType: "plan_item", entityId: "a1", before: row }))
    })
  })

  describe("milestones never take PBI links", () => {
    it("PATCH progressMode linked on a milestone → 400 PLAN_LINK_MILESTONE", async () => {
      liveItem(planRow({ id: "m", isMilestone: true }))
      await expect(svc.updatePlanItem("p1", "m", { progressMode: "linked" }, ACTOR, NOW)).rejects.toMatchObject({ status: 400, code: "PLAN_LINK_MILESTONE" })
      expect(repo.updatePlanItemVersioned).not.toHaveBeenCalled()
    })

    it("PATCH isMilestone on a linked item, or on an item with linked PBIs → 400 PLAN_LINK_MILESTONE", async () => {
      liveItem(planRow({ id: "l", progressMode: "linked" }))
      await expect(svc.updatePlanItem("p1", "l", { isMilestone: true }, ACTOR, NOW)).rejects.toMatchObject({ code: "PLAN_LINK_MILESTONE" })
      liveItem(planRow({ id: "x" }))
      vi.mocked(repo.findLinkedPbisOfItem).mockResolvedValueOnce([{ id: "b1" }] as never)
      await expect(svc.updatePlanItem("p1", "x", { isMilestone: true }, ACTOR, NOW)).rejects.toMatchObject({ code: "PLAN_LINK_MILESTONE" })
      expect(repo.updatePlanItemVersioned).not.toHaveBeenCalled()
    })

    it("allows switching a milestone back to manual and making a manual unlinked item a milestone", async () => {
      const row = liveItem(planRow({ id: "x" }))
      vi.mocked(repo.updatePlanItemVersioned).mockResolvedValue(row as never)
      await svc.updatePlanItem("p1", "x", { isMilestone: true }, ACTOR, NOW)
      await svc.updatePlanItem("p1", "x", { isMilestone: false, progressMode: "linked" }, ACTOR, NOW)
      expect(repo.updatePlanItemVersioned).toHaveBeenCalledTimes(2)
    })

    it("create with isMilestone + progressMode linked → 400 PLAN_LINK_MILESTONE", async () => {
      await expect(
        svc.createPlanItem("p1", { name: "M", plannedStart: "2026-01-01", plannedEnd: "2026-01-01", isMilestone: true, progressMode: "linked" }, ACTOR)
      ).rejects.toMatchObject({ status: 400, code: "PLAN_LINK_MILESTONE" })
      expect(repo.insertPlanItem).not.toHaveBeenCalled()
    })
  })

  describe("deletePlanItem (trash)", () => {
    it("trashes the item and its live subtree with one timestamp and recalculates the parent", async () => {
      liveItem(planRow({ id: "a", parentId: "root" }))
      vi.mocked(repo.softDeletePlanItems).mockResolvedValueOnce(1).mockResolvedValueOnce(1)
      const out = await svc.deletePlanItem("p1", "a", ACTOR, 0, NOW)
      expect(out).toEqual({ deletedCount: 2 })
      expect(repo.softDeletePlanItems).toHaveBeenNthCalledWith(1, TX, "p1", ["a"], "u1", NOW, 0)
      expect(repo.softDeletePlanItems).toHaveBeenNthCalledWith(2, TX, "p1", ["a1"], "u1", NOW)
      expect(recalcPlanProgress).toHaveBeenCalledWith("p1", ["root"], TX)
      expect(tr.purgeIn).not.toHaveBeenCalled()
      expect(act.logDelete).toHaveBeenCalledWith(TX, expect.objectContaining({ meta: { trashed: true, subtreeCount: 2 } }))
    })

    it("404 for unknown items, 409 for a stale version", async () => {
      vi.mocked(repo.findPlanItem).mockResolvedValueOnce(null)
      await expect(svc.deletePlanItem("p1", "x", ACTOR)).rejects.toMatchObject({ status: 404 })
      liveItem(planRow({ id: "b", parentId: "root", version: 7 }))
      vi.mocked(repo.softDeletePlanItems).mockResolvedValueOnce(0)
      await expect(svc.deletePlanItem("p1", "b", ACTOR, 6, NOW)).rejects.toMatchObject({ code: "VERSION_CONFLICT" })
    })
  })

  describe("reorderPlan", () => {
    it("requires every id live in the project and recalculates old + new parents", async () => {
      vi.mocked(repo.findPlanItemsByIds).mockResolvedValueOnce([])
      await expect(svc.reorderPlan("p1", [{ id: "a", parentId: null, sortOrder: 0 }])).rejects.toMatchObject({ status: 400 })
      vi.mocked(repo.findPlanItemsByIds).mockResolvedValueOnce([{ id: "a1", parentId: "a" }])
      await svc.reorderPlan("p1", [{ id: "a1", parentId: "b", sortOrder: 1 }])
      expect(repo.updatePlanItem).toHaveBeenCalledWith(TX, "a1", { parentId: "b", sortOrder: 1 })
      expect(recalcPlanProgress).toHaveBeenCalledWith("p1", ["a", "b"], TX)
    })

    it("rejects a parent outside the live tree", async () => {
      vi.mocked(repo.findPlanItemsByIds).mockResolvedValueOnce([{ id: "a1", parentId: "a" }])
      await expect(svc.reorderPlan("p1", [{ id: "a1", parentId: "foreign", sortOrder: 0 }])).rejects.toMatchObject({ code: "PLAN_PARENT_NOT_FOUND" })
      expect(repo.findPlanTree).toHaveBeenCalledWith(TX, "p1")
      expect(repo.updatePlanItem).not.toHaveBeenCalled()
    })

    it("rejects a cycle formed only by the batch as a whole", async () => {
      vi.mocked(repo.findPlanItemsByIds).mockResolvedValueOnce([{ id: "a", parentId: "root" }, { id: "b", parentId: "root" }])
      const swap = [{ id: "a", parentId: "b", sortOrder: 0 }, { id: "b", parentId: "a", sortOrder: 0 }]
      await expect(svc.reorderPlan("p1", swap)).rejects.toMatchObject({ code: "PLAN_CYCLE" })
    })
  })

  it("getPlanItemDto reads through the given client and 404s", async () => {
    vi.mocked(repo.findPlanItem).mockResolvedValueOnce(null)
    await expect(svc.getPlanItemDto("p1", "x")).rejects.toMatchObject({ code: "PLAN_ITEM_NOT_FOUND" })
    expect(repo.findPlanItem).toHaveBeenCalledWith(DEFAULT_DB, "p1", "x")
  })
})
