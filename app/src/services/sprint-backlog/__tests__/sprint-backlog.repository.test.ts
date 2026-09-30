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
      where: { id: { in: ["b1"] }, projectId: "p1" },
      select: { id: true },
    })
    expect(db.fn("productBacklogItem.findFirst")).toHaveBeenCalledWith({ where: { id: "b1", projectId: "p1" }, select: { id: true } })
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
      where: { id: "t1", sprintId: "s1", sprint: { projectId: "p1" } },
      select: { id: true, pbItemId: true },
    })
  })

  it("task writes", async () => {
    const db = fakeDb()
    const data = { sprintId: "s1", pbItemId: "b1" } as never
    await repo.insertTask(db.client, data)
    await repo.updateTask(db.client, "t1", { status: "done" })
    await repo.deleteTask(db.client, "t1")
    expect(db.fn("sprintBacklogItem.create")).toHaveBeenCalledWith({ data, include: { pbItem: true } })
    expect(db.fn("sprintBacklogItem.update")).toHaveBeenCalledWith({ where: { id: "t1" }, data: { status: "done" }, include: { pbItem: true } })
    expect(db.fn("sprintBacklogItem.delete")).toHaveBeenCalledWith({ where: { id: "t1" } })
  })
})
