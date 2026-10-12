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

const repo = await import("../plan.repository")
const act = await import("@/services/_shared/activity")
const tr = await import("@/services/_shared/translations")
const { recalcPlanProgress } = await import("@/lib/plan-progress")
const { ACTOR } = await import("@/services/__tests__/support")
const { planRow, day } = await import("./plan-fixtures")
const { duplicatePlanItem, copyName, PLAN_DUPLICATE_MAX } = await import("../plan.duplicate")

const source = () => [
  planRow({ id: "root", name: "Root", parentId: "top", sortOrder: 2, status: "done", progressPct: 100, actualStart: day("2026-10-02"), baselineStart: day("2026-10-01"), progressMode: "linked", ownerId: "u2", color: "red" }),
  planRow({ id: "c1", name: "Child 1", parentId: "root", sortOrder: 1, plannedStart: day("2026-10-02"), plannedEnd: day("2026-10-03") }),
  planRow({ id: "c2", name: "Child 2", parentId: "root", sortOrder: 2 }),
  planRow({ id: "other", name: "Other", parentId: "top" }),
]

describe("plan.duplicate", () => {
  let n = 0
  beforeEach(() => {
    vi.clearAllMocks()
    n = 0
    vi.mocked(repo.findPlanItems).mockResolvedValue(source() as never)
    vi.mocked(repo.nextPlanSortOrder).mockResolvedValue(9)
    vi.mocked(repo.insertPlanItem).mockImplementation((async (_tx: unknown, data: Record<string, unknown>) => ({ ...data, id: `new${++n}` })) as never)
    vi.mocked(repo.findDependencies).mockResolvedValue([
      { id: "d1", predecessorId: "c1", successorId: "c2" },
      { id: "d2", predecessorId: "c1", successorId: "other" },
    ] as never)
  })

  it("copies the subtree root first with a suffixed name, reset progress and manual mode", async () => {
    const out = await duplicatePlanItem("p1", "root", {}, ACTOR)
    expect(out).toEqual({ createdIds: ["new1", "new2", "new3"], rootId: "new1" })
    const inserts = vi.mocked(repo.insertPlanItem).mock.calls.map((c) => c[1])
    expect(inserts[0]).toMatchObject({ name: "Root (copy)", parentId: "top", sortOrder: 9, status: "not_started", progressPct: 0, progressMode: "manual", ownerId: "u2", color: "red" })
    expect(inserts[0]).not.toHaveProperty("actualStart")
    expect(inserts[0]).not.toHaveProperty("baselineStart")
    expect(inserts[1]).toMatchObject({ name: "Child 1", parentId: "new1", plannedStart: day("2026-10-02") })
    expect(inserts[2]).toMatchObject({ name: "Child 2", parentId: "new1" })
  })

  it("replicates only dependencies with both ends inside the copy", async () => {
    await duplicatePlanItem("p1", "root", { suffix: " v2" }, ACTOR)
    expect(repo.insertDependency).toHaveBeenCalledOnce()
    expect(repo.insertDependency).toHaveBeenCalledWith(expect.anything(), { projectId: "p1", predecessorId: "new2", successorId: "new3" })
    expect(vi.mocked(repo.insertPlanItem).mock.calls[0][1]).toMatchObject({ name: "Root v2" })
  })

  it("enqueues translations per row, recalculates and logs one create", async () => {
    await duplicatePlanItem("p1", "root", {}, ACTOR)
    expect(tr.enqueueIn).toHaveBeenCalledTimes(3)
    expect(recalcPlanProgress).toHaveBeenCalledOnce()
    expect(act.logCreate).toHaveBeenCalledOnce()
  })

  it("404 for an unknown item and 400 above the row cap", async () => {
    await expect(duplicatePlanItem("p1", "zzz", {}, ACTOR)).rejects.toMatchObject({ code: "PLAN_ITEM_NOT_FOUND" })
    const big = [planRow({ id: "root" }), ...Array.from({ length: PLAN_DUPLICATE_MAX }, (_, i) => planRow({ id: `k${i}`, parentId: "root" }))]
    vi.mocked(repo.findPlanItems).mockResolvedValue(big as never)
    await expect(duplicatePlanItem("p1", "root", {}, ACTOR)).rejects.toMatchObject({ status: 400 })
    expect(repo.insertPlanItem).not.toHaveBeenCalled()
  })

  it("copyName keeps the name within the column", () => {
    expect(copyName("x".repeat(255), " (copy)")).toHaveLength(255)
    expect(copyName("A", " (copy)")).toBe("A (copy)")
  })
})
