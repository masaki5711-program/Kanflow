import { describe, expect, it } from "vitest"
import { fakeDb } from "@/services/__tests__/fake-db"
import * as repo from "../sprint-backlog.repository"

describe("sprint-backlog.repository", () => {
  it("sprint lookups are project-scoped", async () => {
    const db = fakeDb()
    await repo.findSprintPbiIds(db.client, "p1", "s1")
    await repo.findSprintId(db.client, "p1", "s1")
    expect(db.fn("sprint.findFirst")).toHaveBeenNthCalledWith(1, {
      where: { id: "s1", projectId: "p1" },
      select: { id: true, items: { select: { pbItemId: true } } },
    })
    expect(db.fn("sprint.findFirst")).toHaveBeenNthCalledWith(2, { where: { id: "s1", projectId: "p1" }, select: { id: true } })
  })

  it("PBI lookups are project-scoped", async () => {
    const db = fakeDb()
    await repo.findProjectPbiIds(db.client, "p1", ["b1"])
    await repo.findProjectPbiId(db.client, "p1", "b1")
    expect(db.fn("productBacklogItem.findMany")).toHaveBeenCalledWith({
      where: { id: { in: ["b1"] }, projectId: "p1", deletedAt: null },
      select: { id: true },
    })
    expect(db.fn("productBacklogItem.findFirst")).toHaveBeenCalledWith({
      where: { id: "b1", projectId: "p1", deletedAt: null },
      select: { id: true },
    })
  })

  it("placeholders are one todo row per PBI with a NULL taskName", async () => {
    const db = fakeDb()
    await repo.insertPlaceholders(db.client, "s1", ["b1", "b2"])
    await repo.findPlaceholders(db.client, "s1", ["b1"])
    expect(db.fn("sprintBacklogItem.createMany")).toHaveBeenCalledWith({
      data: [
        { sprintId: "s1", pbItemId: "b1", status: "todo" },
        { sprintId: "s1", pbItemId: "b2", status: "todo" },
      ],
    })
    expect(db.fn("sprintBacklogItem.findMany")).toHaveBeenCalledWith({
      where: { sprintId: "s1", pbItemId: { in: ["b1"] }, taskName: null },
      include: { pbItem: true },
    })
  })

  it("rows of a PBI in a sprint", async () => {
    const db = fakeDb()
    await repo.findSprintRowsOfPbi(db.client, "s1", "b1")
    await repo.deleteSprintRowsOfPbi(db.client, "s1", "b1")
    expect(db.fn("sprintBacklogItem.findMany")).toHaveBeenCalledWith({ where: { sprintId: "s1", pbItemId: "b1" }, select: { id: true } })
    expect(db.fn("sprintBacklogItem.deleteMany")).toHaveBeenCalledWith({ where: { sprintId: "s1", pbItemId: "b1" } })
  })

  it("findTask scopes through sprint -> project", async () => {
    const db = fakeDb()
    await repo.findTask(db.client, "p1", "s1", "t1")
    expect(db.fn("sprintBacklogItem.findFirst")).toHaveBeenCalledWith({
      where: { id: "t1", sprintId: "s1", sprint: { projectId: "p1" }, pbItem: { deletedAt: null } },
      select: { id: true, pbItemId: true },
    })
  })

  it("task writes", async () => {
    const db = fakeDb()
    const data = { sprintId: "s1", pbItemId: "b1" } as never
    await repo.insertTask(db.client, data)
    expect(db.fn("sprintBacklogItem.create")).toHaveBeenCalledWith({ data, include: { pbItem: true } })
  })

  it("updateTask is a version compare-and-set that bumps the version", async () => {
    const db = fakeDb({ "sprintBacklogItem.updateMany": { count: 1 } })
    await expect(repo.updateTask(db.client, "t1", { status: "done" }, 2)).resolves.toBe(1)
    expect(db.fn("sprintBacklogItem.updateMany")).toHaveBeenCalledWith({
      where: { id: "t1", version: 2 },
      data: { status: "done", version: { increment: 1 } },
    })
    await repo.updateTask(db.client, "t1", { status: "done" })
    expect(db.fn("sprintBacklogItem.updateMany")).toHaveBeenLastCalledWith({
      where: { id: "t1" },
      data: { status: "done", version: { increment: 1 } },
    })
  })

  it("deleteTask checks the version when given and returns the count", async () => {
    const db = fakeDb({ "sprintBacklogItem.deleteMany": { count: 0 } })
    await expect(repo.deleteTask(db.client, "t1", 5)).resolves.toBe(0)
    expect(db.fn("sprintBacklogItem.deleteMany")).toHaveBeenCalledWith({ where: { id: "t1", version: 5 } })
  })

  it("findTaskDetail loads the PBI and the assignees in assignment order", async () => {
    const db = fakeDb()
    await repo.findTaskDetail(db.client, "t1")
    expect(db.fn("sprintBacklogItem.findFirst")).toHaveBeenCalledWith({
      where: { id: "t1" },
      include: {
        pbItem: true,
        assignees: { select: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } },
      },
    })
  })

  it("findProjectMemberCandidates maps members to {id, name}", async () => {
    const db = fakeDb({ "projectMember.findMany": [{ userId: "u1", user: { name: "Ann" } }] })
    await expect(repo.findProjectMemberCandidates(db.client, "p1")).resolves.toEqual([{ id: "u1", name: "Ann" }])
    expect(db.fn("projectMember.findMany")).toHaveBeenCalledWith({
      where: { projectId: "p1" },
      select: { userId: true, user: { select: { name: true } } },
    })
  })

  it("findTaskAssigneeIds lists the task's user ids", async () => {
    const db = fakeDb({ "taskAssignee.findMany": [{ userId: "u1" }, { userId: "u2" }] })
    await expect(repo.findTaskAssigneeIds(db.client, "t1")).resolves.toEqual(["u1", "u2"])
  })

  it("replaceTaskAssignees deletes the old set and inserts the new one", async () => {
    const db = fakeDb()
    await repo.replaceTaskAssignees(db.client, "t1", ["u1", "u2"])
    expect(db.fn("taskAssignee.deleteMany")).toHaveBeenCalledWith({ where: { taskId: "t1" } })
    expect(db.fn("taskAssignee.createMany")).toHaveBeenCalledWith({
      data: [{ taskId: "t1", userId: "u1" }, { taskId: "t1", userId: "u2" }],
      skipDuplicates: true,
    })
  })

  it("replaceTaskAssignees with [] only clears", async () => {
    const db = fakeDb()
    await repo.replaceTaskAssignees(db.client, "t1", [])
    expect(db.fn("taskAssignee.deleteMany")).toHaveBeenCalled()
    expect(db.fn("taskAssignee.createMany")).not.toHaveBeenCalled()
  })
})
