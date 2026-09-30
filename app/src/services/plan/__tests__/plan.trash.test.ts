import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/services/_shared/activity", async () => (await import("@/services/__tests__/support")).activityMock())
vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/services/_shared/translations", async () => (await import("@/services/__tests__/support")).translationMock())
vi.mock("@/services/_shared/soft-delete", async () => ({
  ...(await vi.importActual<typeof import("@/services/_shared/soft-delete")>("@/services/_shared/soft-delete")),
  assertProjectLive: vi.fn(async () => undefined),
}))
vi.mock("@/lib/plan-progress", async () => ({
  ...(await vi.importActual<typeof import("@/lib/plan-progress")>("@/lib/plan-progress")),
  recalcPlanProgress: vi.fn(async () => []),
}))
vi.mock("../plan.repository")

const repo = await import("../plan.repository")
const tr = await import("@/services/_shared/translations")
const act = await import("@/services/_shared/activity")
const sd = await import("@/services/_shared/soft-delete")
const { recalcPlanProgress } = await import("@/lib/plan-progress")
const { ACTOR, TX, DEFAULT_DB } = await import("@/services/__tests__/support")
const trash = await import("../plan.trash")

const T1 = new Date("2026-10-01T00:00:00Z")
const T0 = new Date("2026-09-20T00:00:00Z")

const trashed = (id: string, parentId: string | null, deletedAt: Date, parentDeletedAt: Date | null | undefined = undefined) => ({
  id,
  parentId,
  name: id,
  status: "not_started",
  deletedAt,
  deletedById: "u1",
  parent: parentId ? { deletedAt: parentDeletedAt ?? null } : null,
})

describe("plan.trash", () => {
  beforeEach(() => vi.clearAllMocks())

  it("trashRoots lists batch roots with their batch size", () => {
    const rows = [
      trashed("r", null, T1),
      trashed("a", "r", T1, T1),
      trashed("a1", "a", T1, T1),
      trashed("x", "live", T0, null),
      trashed("y", "r", T0, T1),
    ]
    expect(trash.trashRoots(rows as never)).toEqual([
      { id: "r", name: "r", status: "not_started", deletedAt: T1, deletedById: "u1", subtreeCount: 3 },
      { id: "x", name: "x", status: "not_started", deletedAt: T0, deletedById: "u1", subtreeCount: 1 },
      { id: "y", name: "y", status: "not_started", deletedAt: T0, deletedById: "u1", subtreeCount: 1 },
    ])
  })

  it("listTrashedPlanRoots reads the project's trash", async () => {
    vi.mocked(repo.findTrashedPlanItems).mockResolvedValue([])
    await expect(trash.listTrashedPlanRoots("p1")).resolves.toEqual([])
    expect(repo.findTrashedPlanItems).toHaveBeenCalledWith(DEFAULT_DB, "p1")
  })

  describe("restorePlanItem", () => {
    it("restores the whole batch under its live parent and recalculates", async () => {
      vi.mocked(repo.findTrashedPlanItem).mockResolvedValue({ id: "a", parentId: "r", deletedAt: T1, name: "A" })
      vi.mocked(repo.findPlanTreeWithTrash).mockResolvedValue([
        { id: "r", parentId: null, deletedAt: null },
        { id: "a", parentId: "r", deletedAt: T1 },
        { id: "a1", parentId: "a", deletedAt: T1 },
        { id: "a2", parentId: "a", deletedAt: T0 },
      ])
      await trash.restorePlanItem("p1", "a", ACTOR)
      expect(sd.assertProjectLive).toHaveBeenCalledWith(TX, "p1")
      expect(vi.mocked(repo.restorePlanItems).mock.calls[0][2].toSorted()).toEqual(["a", "a1"])
      expect(repo.updatePlanItem).not.toHaveBeenCalled()
      expect(recalcPlanProgress).toHaveBeenCalledWith("p1", ["a", "r"], TX)
      expect(act.logActivity).toHaveBeenCalledWith(TX, expect.objectContaining({ action: "restore", diff: { label: "A", meta: { subtreeCount: 2 } } }))
    })

    it("moves the root to the top level when its parent is still in the trash", async () => {
      vi.mocked(repo.findTrashedPlanItem).mockResolvedValue({ id: "a", parentId: "r", deletedAt: T0, name: "A" })
      vi.mocked(repo.findPlanTreeWithTrash).mockResolvedValue([
        { id: "r", parentId: null, deletedAt: T1 },
        { id: "a", parentId: "r", deletedAt: T0 },
      ])
      await trash.restorePlanItem("p1", "a", ACTOR)
      expect(repo.updatePlanItem).toHaveBeenCalledWith(TX, "a", { parentId: null })
      expect(recalcPlanProgress).toHaveBeenCalledWith("p1", ["a", null], TX)
    })

    it("404 when not in the trash", async () => {
      vi.mocked(repo.findTrashedPlanItem).mockResolvedValue(null)
      await expect(trash.restorePlanItem("p1", "x", ACTOR)).rejects.toMatchObject({ status: 404, code: "PLAN_ITEM_NOT_FOUND" })
    })
  })

  describe("purgePlanItem", () => {
    it("hard-deletes the root and purges the subtree translations", async () => {
      vi.mocked(repo.findTrashedPlanItem).mockResolvedValue({ id: "a", parentId: null, deletedAt: T1, name: "A" })
      vi.mocked(repo.findPlanTreeWithTrash).mockResolvedValue([
        { id: "a", parentId: null, deletedAt: T1 },
        { id: "a1", parentId: "a", deletedAt: T1 },
      ])
      await trash.purgePlanItem("p1", "a", null)
      expect(repo.deletePlanItemHard).toHaveBeenCalledWith(TX, "p1", "a")
      expect(vi.mocked(tr.purgeIn).mock.calls[0][1].plan_item?.toSorted()).toEqual(["a", "a1"])
      expect(act.logActivity).toHaveBeenCalledWith(TX, expect.objectContaining({ actor: null, diff: { label: "A", meta: { purged: true, subtreeCount: 2 } } }))
    })

    it("404 when not in the trash", async () => {
      vi.mocked(repo.findTrashedPlanItem).mockResolvedValue(null)
      await expect(trash.purgePlanItem("p1", "x", ACTOR)).rejects.toMatchObject({ status: 404 })
      expect(repo.deletePlanItemHard).not.toHaveBeenCalled()
    })
  })
})
