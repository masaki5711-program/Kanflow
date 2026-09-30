import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/services/_shared/translations", async () => (await import("@/services/__tests__/support")).translationMock())
vi.mock("@/lib/plan-progress", () => ({
  recalcPlanProgress: vi.fn(async () => undefined),
  statusToProgress: (s: string) => (s === "done" ? 100 : 0),
}))
vi.mock("../plan.repository")

const repo = await import("../plan.repository")
const tr = await import("@/services/_shared/translations")
const { recalcPlanProgress } = await import("@/lib/plan-progress")
const { ACTOR, TX } = await import("@/services/__tests__/support")
const svc = await import("../plan.service")

const TREE = [
  { id: "root", parentId: null },
  { id: "a", parentId: "root" },
  { id: "a1", parentId: "a" },
  { id: "b", parentId: "root" },
]

describe("plan.service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(repo.findPlanTree).mockResolvedValue(TREE)
  })

  it("creates under a parent of the project and recalculates the parent", async () => {
    vi.mocked(repo.findPlanItem).mockResolvedValue({ id: "root", parentId: null })
    vi.mocked(repo.nextPlanSortOrder).mockResolvedValue(3)
    vi.mocked(repo.insertPlanItem).mockResolvedValue({ id: "n", parentId: "root" } as never)
    const input = { name: "N", plannedStart: "2026-01-01", plannedEnd: "2026-02-01", parentId: "root", status: "done" as const }
    await svc.createPlanItem("p1", input, ACTOR)
    expect(repo.insertPlanItem).toHaveBeenCalledWith(TX, expect.objectContaining({ progressPct: 100, sortOrder: 3 }))
    expect(recalcPlanProgress).toHaveBeenCalledWith("p1", ["root"], TX)
    expect(tr.enqueueIn).toHaveBeenCalledWith(TX, "plan_item", "n", { id: "n", parentId: "root" })
  })

  it("rejects bad dates and unknown parents", async () => {
    await expect(svc.createPlanItem("p1", { name: "N", plannedStart: "x", plannedEnd: "y" }, ACTOR))
      .rejects.toThrow("日付が不正です")
    vi.mocked(repo.findPlanItem).mockResolvedValue(null)
    await expect(svc.createPlanItem("p1", { name: "N", plannedStart: "2026-01-01", plannedEnd: "2026-01-02", parentId: "zz" }, ACTOR))
      .rejects.toThrow("親項目が見つかりません")
  })

  it("buildPlanUpdate includes only provided fields", () => {
    const out = svc.buildPlanUpdate({ name: "x", actualStart: null, actualEnd: "", plannedStart: "2026-01-01" })
    expect(out).toEqual({ name: "x", actualStart: null, actualEnd: null, plannedStart: new Date("2026-01-01") })
    expect(svc.buildPlanUpdate({})).toEqual({})
  })

  it("update guards against self-parenting, foreign parents and cycles", async () => {
    vi.mocked(repo.findPlanItem).mockResolvedValue({ id: "a", parentId: "root" })
    await expect(svc.updatePlanItem("p1", "a", { parentId: "a" }, ACTOR)).rejects.toThrow("自分自身")
    await expect(svc.updatePlanItem("p1", "a", { parentId: "a1" }, ACTOR)).rejects.toThrow("循環参照")
    await expect(svc.updatePlanItem("p1", "a", { parentId: "elsewhere" }, ACTOR)).rejects.toThrow("親項目")
    expect(repo.updatePlanItem).not.toHaveBeenCalled()
  })

  it("update 404s for unknown items", async () => {
    vi.mocked(repo.findPlanItem).mockResolvedValue(null)
    await expect(svc.updatePlanItem("p1", "x", { name: "n" }, ACTOR)).rejects.toMatchObject({ status: 404 })
  })

  it("update reparents, sets leaf progress and rebalances old + new ancestors", async () => {
    vi.mocked(repo.findPlanItem).mockResolvedValue({ id: "a1", parentId: "a" })
    vi.mocked(repo.updatePlanItem).mockResolvedValue({ id: "a1" } as never)
    vi.mocked(repo.countPlanChildren).mockResolvedValue(0)
    await svc.updatePlanItem("p1", "a1", { parentId: "b", status: "done" }, ACTOR)
    expect(repo.updatePlanItem).toHaveBeenCalledWith(TX, "a1", { progressPct: 100 })
    expect(recalcPlanProgress).toHaveBeenCalledWith("p1", ["a1", "a", "b"], TX)
    expect(tr.enqueueIn).toHaveBeenCalledWith(TX, "plan_item", "a1", { parentId: "b", status: "done" })
  })

  it("delete purges translations of the whole subtree", async () => {
    vi.mocked(repo.findPlanItem).mockResolvedValue({ id: "a", parentId: "root" })
    await svc.deletePlanItem("p1", "a")
    expect(repo.deletePlanItem).toHaveBeenCalledWith(TX, "a")
    expect(tr.purgeIn).toHaveBeenCalledWith(TX, { plan_item: expect.arrayContaining(["a", "a1"]) })
    expect(vi.mocked(tr.purgeIn).mock.calls[0][1].plan_item).toHaveLength(2)
    expect(recalcPlanProgress).toHaveBeenCalledWith("p1", ["root"], TX)
  })

  it("delete 404s for unknown items", async () => {
    vi.mocked(repo.findPlanItem).mockResolvedValue(null)
    await expect(svc.deletePlanItem("p1", "x")).rejects.toMatchObject({ status: 404 })
  })

  it("reorder requires every id in the project and recalculates old + new parents", async () => {
    vi.mocked(repo.findPlanItemsByIds).mockResolvedValueOnce([])
    await expect(svc.reorderPlan("p1", [{ id: "a", parentId: null, sortOrder: 0 }])).rejects.toMatchObject({ status: 400 })
    vi.mocked(repo.findPlanItemsByIds).mockResolvedValueOnce([{ id: "a1", parentId: "a" }])
    await svc.reorderPlan("p1", [{ id: "a1", parentId: "b", sortOrder: 1 }])
    expect(repo.updatePlanItem).toHaveBeenCalledWith(TX, "a1", { parentId: "b", sortOrder: 1 })
    expect(recalcPlanProgress).toHaveBeenCalledWith("p1", ["a", "b"], TX)
  })

  it("reorder rejects a parent outside the project's plan tree", async () => {
    vi.mocked(repo.findPlanItemsByIds).mockResolvedValueOnce([{ id: "a1", parentId: "a" }])
    await expect(svc.reorderPlan("p1", [{ id: "a1", parentId: "foreign", sortOrder: 0 }]))
      .rejects.toMatchObject({ status: 400, code: "PLAN_PARENT_NOT_FOUND" })
    expect(repo.findPlanTree).toHaveBeenCalledWith(TX, "p1")
    expect(repo.updatePlanItem).not.toHaveBeenCalled()
  })

  it("reorder rejects self-parenting", async () => {
    vi.mocked(repo.findPlanItemsByIds).mockResolvedValueOnce([{ id: "a", parentId: "root" }])
    await expect(svc.reorderPlan("p1", [{ id: "a", parentId: "a", sortOrder: 0 }]))
      .rejects.toMatchObject({ status: 400, code: "PLAN_SELF_PARENT" })
    expect(repo.updatePlanItem).not.toHaveBeenCalled()
  })

  it("reorder rejects moving an item under its own descendant", async () => {
    vi.mocked(repo.findPlanItemsByIds).mockResolvedValueOnce([{ id: "a", parentId: "root" }])
    await expect(svc.reorderPlan("p1", [{ id: "a", parentId: "a1", sortOrder: 0 }]))
      .rejects.toMatchObject({ status: 400, code: "PLAN_CYCLE" })
    expect(repo.updatePlanItem).not.toHaveBeenCalled()
  })

  it("reorder rejects a cycle formed only by the batch as a whole", async () => {
    vi.mocked(repo.findPlanItemsByIds).mockResolvedValueOnce([{ id: "a", parentId: "root" }, { id: "b", parentId: "root" }])
    const swap = [{ id: "a", parentId: "b", sortOrder: 0 }, { id: "b", parentId: "a", sortOrder: 0 }]
    await expect(svc.reorderPlan("p1", swap)).rejects.toMatchObject({ code: "PLAN_CYCLE" })
    expect(repo.updatePlanItem).not.toHaveBeenCalled()
  })

  it("reorder validates against the final tree (a batch may untangle before nesting)", async () => {
    vi.mocked(repo.findPlanItemsByIds).mockResolvedValueOnce([{ id: "a1", parentId: "a" }, { id: "a", parentId: "root" }])
    await svc.reorderPlan("p1", [{ id: "a1", parentId: "root", sortOrder: 0 }, { id: "a", parentId: "a1", sortOrder: 0 }])
    expect(repo.updatePlanItem).toHaveBeenCalledTimes(2)
  })

  it("assertValidReorder allows moving to the root", () => {
    expect(() => svc.assertValidReorder(TREE, [{ id: "a1", parentId: null, sortOrder: 0 }])).not.toThrow()
  })
})
