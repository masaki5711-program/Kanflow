import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/services/_shared/activity", async () => (await import("@/services/__tests__/support")).activityMock())
vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("../plan.repository")

const repo = await import("../plan.repository")
const act = await import("@/services/_shared/activity")
const { ACTOR, TX } = await import("@/services/__tests__/support")
const sched = await import("../plan.schedule")

const TREE = [
  { id: "r", parentId: null },
  { id: "a", parentId: "r" },
  { id: "b", parentId: "r" },
  { id: "c", parentId: null },
]
const edge = (predecessorId: string, successorId: string) => ({ predecessorId, successorId })

describe("plan.schedule", () => {
  beforeEach(() => vi.clearAllMocks())

  describe("baseline", () => {
    it("copies planned dates (project or selected items) and logs one project row", async () => {
      vi.mocked(repo.copyBaseline).mockResolvedValue(5)
      await expect(sched.setBaseline("p1", undefined, ACTOR)).resolves.toEqual({ updated: 5 })
      expect(repo.copyBaseline).toHaveBeenCalledWith(TX, "p1", undefined)
      await sched.setBaseline("p1", ["a"], ACTOR)
      expect(repo.copyBaseline).toHaveBeenLastCalledWith(TX, "p1", ["a"])
      expect(act.logActivity).toHaveBeenLastCalledWith(TX, expect.objectContaining({ entityType: "project", diff: expect.objectContaining({ meta: { count: 5, scope: "items" } }) }))
    })

    it("clears", async () => {
      vi.mocked(repo.clearBaseline).mockResolvedValue(2)
      await expect(sched.clearBaseline("p1", ACTOR)).resolves.toEqual({ updated: 2 })
    })
  })

  describe("dependency rules (pure)", () => {
    it("reaches follows edges and survives cycles", () => {
      const edges = [edge("a", "b"), edge("b", "c"), edge("c", "b")]
      expect(sched.reaches(edges, "a", "c")).toBe(true)
      expect(sched.reaches(edges, "c", "a")).toBe(false)
      expect(sched.reaches([], "x", "x")).toBe(true)
    })

    it("isAncestorPair", () => {
      expect(sched.isAncestorPair(TREE, "r", "a")).toBe(true)
      expect(sched.isAncestorPair(TREE, "a", "r")).toBe(true)
      expect(sched.isAncestorPair(TREE, "a", "b")).toBe(false)
    })

    it("assertValidDependency", () => {
      expect(() => sched.assertValidDependency(TREE, [], edge("a", "zz"))).toThrow(expect.objectContaining({ code: "PLAN_ITEM_NOT_FOUND" }))
      expect(() => sched.assertValidDependency(TREE, [], edge("a", "a"))).toThrow(expect.objectContaining({ code: "PLAN_DEPENDENCY_INVALID" }))
      expect(() => sched.assertValidDependency(TREE, [], edge("r", "a"))).toThrow(expect.objectContaining({ code: "PLAN_DEPENDENCY_INVALID" }))
      expect(() => sched.assertValidDependency(TREE, [edge("a", "b")], edge("a", "b"))).toThrow(expect.objectContaining({ status: 409, code: "PLAN_DEPENDENCY_EXISTS" }))
      expect(() => sched.assertValidDependency(TREE, [edge("a", "b"), edge("b", "c")], edge("c", "a"))).toThrow(expect.objectContaining({ code: "PLAN_DEPENDENCY_CYCLE" }))
      // A cycle through a trashed item (absent from the live tree) still counts.
      expect(() => sched.assertValidDependency(TREE, [edge("a", "gone"), edge("gone", "c")], edge("c", "a"))).toThrow(expect.objectContaining({ code: "PLAN_DEPENDENCY_CYCLE" }))
      expect(() => sched.assertValidDependency(TREE, [edge("a", "b")], edge("b", "c"))).not.toThrow()
    })
  })

  it("createDependency validates against the live tree + all edges, inserts and logs", async () => {
    vi.mocked(repo.findPlanTree).mockResolvedValue(TREE)
    vi.mocked(repo.findDependencies).mockResolvedValue([])
    vi.mocked(repo.insertDependency).mockResolvedValue({ id: "d1", predecessorId: "a", successorId: "b" })
    await expect(sched.createDependency("p1", edge("a", "b"), ACTOR)).resolves.toEqual({ id: "d1", predecessorId: "a", successorId: "b" })
    expect(repo.insertDependency).toHaveBeenCalledWith(TX, { projectId: "p1", predecessorId: "a", successorId: "b" })
    expect(act.logActivity).toHaveBeenCalledWith(TX, expect.objectContaining({ entityType: "plan_item", entityId: "b", diff: { meta: { dependency: { added: "a" } } } }))
    await expect(sched.createDependency("p1", edge("a", "a"), ACTOR)).rejects.toMatchObject({ status: 400 })
  })

  it("deleteDependency 404s outside the project", async () => {
    vi.mocked(repo.findDependency).mockResolvedValueOnce(null)
    await expect(sched.deleteDependency("p1", "d9", ACTOR)).rejects.toMatchObject({ status: 404 })
    vi.mocked(repo.findDependency).mockResolvedValueOnce({ id: "d1", predecessorId: "a", successorId: "b" })
    await sched.deleteDependency("p1", "d1", ACTOR)
    expect(repo.deleteDependency).toHaveBeenCalledWith(TX, "d1")
  })
})
