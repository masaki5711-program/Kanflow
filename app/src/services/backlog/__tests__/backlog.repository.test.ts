import { describe, expect, it } from "vitest"
import { fakeDb } from "@/services/__tests__/fake-db"
import { LIST_LIMITS } from "@/services/_shared/limits"
import * as repo from "../backlog.repository"

describe("backlog.repository", () => {
  it("findBacklogItems scopes by projectId, bounds the list and only includes open sprints", async () => {
    const db = fakeDb({ "productBacklogItem.findMany": [] })
    await repo.findBacklogItems(db.client, "p1")
    const arg = db.fn("productBacklogItem.findMany").mock.calls[0][0]
    expect(arg.where).toEqual({ projectId: "p1" })
    expect(arg.take).toBe(LIST_LIMITS.backlogItems)
    expect(arg.orderBy).toEqual([{ sortOrder: "asc" }, { createdAt: "asc" }])
    expect(arg.include.sprintItems.where).toEqual({ sprint: { status: { in: ["planning", "active"] } } })
    expect(arg.include.iceboxItem).toBeDefined()
    expect(arg.include.productGoal).toBeDefined()
  })

  it("findBacklogItem requires both id and projectId", async () => {
    const db = fakeDb()
    await repo.findBacklogItem(db.client, "p1", "b1")
    expect(db.fn("productBacklogItem.findFirst").mock.calls[0][0].where).toEqual({ id: "b1", projectId: "p1" })
  })

  it("nextBacklogNumbers returns max + 1 scoped to the project", async () => {
    const db = fakeDb({ "productBacklogItem.aggregate": { _max: { displayId: 7, sortOrder: 3 } } })
    await expect(repo.nextBacklogNumbers(db.client, "p1")).resolves.toEqual({ displayId: 8, sortOrder: 4 })
    expect(db.fn("productBacklogItem.aggregate")).toHaveBeenCalledWith({
      where: { projectId: "p1" },
      _max: { displayId: true, sortOrder: true },
    })
  })

  it("nextBacklogNumbers starts at 1 for an empty project", async () => {
    const db = fakeDb({ "productBacklogItem.aggregate": { _max: { displayId: null, sortOrder: null } } })
    await expect(repo.nextBacklogNumbers(db.client, "p1")).resolves.toEqual({ displayId: 1, sortOrder: 1 })
  })

  it("insertBacklogItem passes the data through", async () => {
    const db = fakeDb()
    const data = { projectId: "p1", displayId: 1 } as never
    await repo.insertBacklogItem(db.client, data)
    expect(db.fn("productBacklogItem.create")).toHaveBeenCalledWith({ data })
  })

  it("update / delete / setSortOrder are all project-scoped", async () => {
    const db = fakeDb()
    await repo.updateBacklogItem(db.client, "p1", "b1", { epic: "e" })
    await repo.deleteBacklogItem(db.client, "p1", "b1")
    await repo.setBacklogSortOrder(db.client, "p1", "b1", 5)
    expect(db.fn("productBacklogItem.update")).toHaveBeenCalledWith({ where: { id: "b1", projectId: "p1" }, data: { epic: "e" } })
    expect(db.fn("productBacklogItem.delete")).toHaveBeenCalledWith({ where: { id: "b1", projectId: "p1" } })
    expect(db.fn("productBacklogItem.updateMany")).toHaveBeenCalledWith({
      where: { id: "b1", projectId: "p1" },
      data: { sortOrder: 5 },
    })
  })

  it("findTasksOfBacklogItem selects the cascading sprint rows", async () => {
    const db = fakeDb()
    await repo.findTasksOfBacklogItem(db.client, "b1")
    expect(db.fn("sprintBacklogItem.findMany")).toHaveBeenCalledWith({
      where: { pbItemId: "b1" },
      select: { id: true, sprintId: true },
    })
  })
})
