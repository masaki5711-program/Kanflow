import { beforeEach, describe, expect, it, vi } from "vitest"

const db = vi.hoisted(() => ({
  projectMember: { findMany: vi.fn() },
  productBacklogItem: { count: vi.fn() },
  sprint: { count: vi.fn() },
  sprintBacklogItem: { count: vi.fn() },
}))
vi.mock("@/services/_shared/db", () => ({ defaultDb: db }))

const { loadPoHomeSummary, sprintCompletionPct } = await import("../po-home-summary")

describe("A3-16 loadPoHomeSummary", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns null (and runs no counts) for a user who is PO of no live project", async () => {
    db.projectMember.findMany.mockResolvedValue([])
    expect(await loadPoHomeSummary("u1")).toBeNull()
    expect(db.projectMember.findMany).toHaveBeenCalledWith({
      where: { userId: "u1", role: "po", project: { status: "active", deletedAt: null } },
      select: { projectId: true },
    })
    expect(db.productBacklogItem.count).not.toHaveBeenCalled()
  })

  it("counts not-ready PBIs, sprints in review and the running sprints' real tasks", async () => {
    db.projectMember.findMany.mockResolvedValue([{ projectId: "p1" }, { projectId: "p2" }])
    db.productBacklogItem.count.mockResolvedValue(7)
    db.sprint.count.mockImplementation(async ({ where }: { where: { status: string } }) => (where.status === "review" ? 1 : 2))
    db.sprintBacklogItem.count.mockImplementation(async ({ where }: { where: { status?: string } }) => (where.status === "done" ? 3 : 8))

    expect(await loadPoHomeSummary("u1")).toEqual({ singleProjectId: null, notReady: 7, inReview: 1, activeSprints: 2, totalTasks: 8, doneTasks: 3 })
    const ids = { projectId: { in: ["p1", "p2"] } }
    expect(db.productBacklogItem.count).toHaveBeenCalledWith({ where: { ...ids, status: "not_ready", deletedAt: null } })
    const taskWhere = db.sprintBacklogItem.count.mock.calls[0][0].where
    expect(taskWhere.sprint).toEqual({ ...ids, status: "active" })
    expect(taskWhere.pbItem).toEqual({ deletedAt: null })
    // placeholder rows (no task name) are not tasks
    expect(taskWhere.AND).toEqual([{ taskName: { not: null } }, { taskName: { not: "" } }])
  })

  it("names the single PO project so tiles can link into it", async () => {
    db.projectMember.findMany.mockResolvedValue([{ projectId: "p1" }])
    db.productBacklogItem.count.mockResolvedValue(0)
    db.sprint.count.mockResolvedValue(0)
    db.sprintBacklogItem.count.mockResolvedValue(0)
    expect((await loadPoHomeSummary("u1"))?.singleProjectId).toBe("p1")
  })

  it("sprintCompletionPct rounds and is null without tasks", () => {
    expect(sprintCompletionPct({ totalTasks: 3, doneTasks: 1 })).toBe(33)
    expect(sprintCompletionPct({ totalTasks: 0, doneTasks: 0 })).toBeNull()
  })
})
