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

  it("dependency writers take the project's lock before they read the edges (two of them could close a cycle together)", async () => {
    vi.mocked(repo.findPlanTree).mockResolvedValue(TREE)
    vi.mocked(repo.findDependencies).mockResolvedValue([])
    vi.mocked(repo.insertDependency).mockResolvedValue({ id: "d1", predecessorId: "a", successorId: "b" })
    const lockedFirst = () => {
      expect(repo.lockDependencies).toHaveBeenCalledTimes(1)
      expect(repo.lockDependencies).toHaveBeenCalledWith(TX, "p1")
      expect(vi.mocked(repo.lockDependencies).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(repo.findDependencies).mock.invocationCallOrder[0])
    }
    await sched.createDependency("p1", edge("a", "b"), ACTOR)
    lockedFirst()
    vi.clearAllMocks()
    vi.mocked(repo.findPlanTree).mockResolvedValue(TREE)
    vi.mocked(repo.findDependencies).mockResolvedValue([])
    await sched.setPredecessors("p1", "c", [], ACTOR)
    lockedFirst()
  })

  it("deleteDependency 404s outside the project", async () => {
    vi.mocked(repo.findDependency).mockResolvedValueOnce(null)
    await expect(sched.deleteDependency("p1", "d9", ACTOR)).rejects.toMatchObject({ status: 404 })
    vi.mocked(repo.findDependency).mockResolvedValueOnce({ id: "d1", predecessorId: "a", successorId: "b" })
    await sched.deleteDependency("p1", "d1", ACTOR)
    expect(repo.deleteDependency).toHaveBeenCalledWith(TX, "d1")
  })

  it("deleteDependency takes the writers' lock before it looks the dependency up (a replacement may be removing it)", async () => {
    vi.mocked(repo.findDependency).mockResolvedValueOnce({ id: "d1", predecessorId: "a", successorId: "b" })
    await sched.deleteDependency("p1", "d1", ACTOR)
    expect(repo.lockDependencies).toHaveBeenCalledWith(TX, "p1")
    expect(vi.mocked(repo.lockDependencies).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(repo.findDependency).mock.invocationCallOrder[0])
  })

  describe("setPredecessors (MCP set_plan_dependencies)", () => {
    const dep = (id: string, predecessorId: string, successorId: string) => ({ id, predecessorId, successorId })
    beforeEach(() => {
      vi.mocked(repo.findPlanTree).mockResolvedValue(TREE)
      // The only insert in the tests below is r → c (the service logs from the inserted row).
      vi.mocked(repo.insertDependency).mockResolvedValue(dep("new", "r", "c"))
    })

    it("adds the missing predecessors, removes the others, keeps the rest, and logs every change", async () => {
      vi.mocked(repo.findDependencies).mockResolvedValue([dep("d1", "a", "c"), dep("d2", "b", "c"), dep("d3", "a", "b")])
      await expect(sched.setPredecessors("p1", "c", ["b", "r", "r"], ACTOR)).resolves.toEqual({ successorId: "c", dependsOn: ["b", "r"], added: 1, removed: 1, removedIds: ["a"] })
      expect(repo.deleteDependency).toHaveBeenCalledTimes(1)
      expect(repo.deleteDependency).toHaveBeenCalledWith(TX, "d1")
      expect(repo.insertDependency).toHaveBeenCalledTimes(1)
      expect(repo.insertDependency).toHaveBeenCalledWith(TX, { projectId: "p1", predecessorId: "r", successorId: "c" })
      expect(act.logActivity).toHaveBeenCalledWith(TX, expect.objectContaining({ entityId: "c", diff: { meta: { dependency: { removed: "a" } } } }))
      expect(act.logActivity).toHaveBeenCalledWith(TX, expect.objectContaining({ entityId: "c", diff: { meta: { dependency: { added: "r" } } } }))
    })

    it("an empty list removes every live predecessor", async () => {
      vi.mocked(repo.findDependencies).mockResolvedValue([dep("d1", "a", "c"), dep("d2", "b", "c")])
      await expect(sched.setPredecessors("p1", "c", [], ACTOR)).resolves.toEqual({ successorId: "c", dependsOn: [], added: 0, removed: 2, removedIds: ["a", "b"] })
    })

    it("the list the item already has changes nothing and logs nothing", async () => {
      vi.mocked(repo.findDependencies).mockResolvedValue([dep("d1", "a", "c")])
      await expect(sched.setPredecessors("p1", "c", ["a"], ACTOR)).resolves.toMatchObject({ added: 0, removed: 0, removedIds: [] })
      expect(repo.deleteDependency).not.toHaveBeenCalled()
      expect(repo.insertDependency).not.toHaveBeenCalled()
      expect(act.logActivity).not.toHaveBeenCalled()
    })

    it("leaves a dependency whose predecessor is in the trash (get_plan does not show it)", async () => {
      vi.mocked(repo.findDependencies).mockResolvedValue([dep("d1", "gone", "c"), dep("d2", "a", "c")])
      await expect(sched.setPredecessors("p1", "c", [], ACTOR)).resolves.toMatchObject({ removed: 1, removedIds: ["a"] })
      expect(repo.deleteDependency).toHaveBeenCalledTimes(1)
      expect(repo.deleteDependency).toHaveBeenCalledWith(TX, "d2")
    })

    it.each([
      ["an unknown item", "zz", ["a"], [], "PLAN_ITEM_NOT_FOUND"],
      ["an unknown predecessor", "c", ["a", "zz"], [], "PLAN_ITEM_NOT_FOUND"],
      ["a predecessor in the trash", "c", ["gone"], [dep("d1", "gone", "c")], "PLAN_ITEM_NOT_FOUND"],
      ["the item itself", "c", ["c"], [], "PLAN_DEPENDENCY_INVALID"],
      ["its parent", "a", ["r"], [], "PLAN_DEPENDENCY_INVALID"],
      ["a cycle", "a", ["c"], [dep("d1", "a", "b"), dep("d2", "b", "c")], "PLAN_DEPENDENCY_CYCLE"],
    ])("%s is refused and nothing is written, not even the removals of the same call", async (_label, successorId, wanted, edges, code) => {
      vi.mocked(repo.findDependencies).mockResolvedValue([...edges, dep("d9", "b", successorId)])
      await expect(sched.setPredecessors("p1", successorId, wanted, ACTOR)).rejects.toMatchObject({ code })
      expect(repo.deleteDependency).not.toHaveBeenCalled()
      expect(repo.insertDependency).not.toHaveBeenCalled()
      expect(act.logActivity).not.toHaveBeenCalled()
    })
  })
})
