import { describe, expect, it } from "vitest"
import { fakeDb } from "@/services/__tests__/fake-db"
import { LIST_LIMITS } from "@/services/_shared/limits"
import * as repo from "../backlog.repository"

describe("backlog.repository", () => {
  it("findBacklogItems scopes by projectId, bounds the list and only includes open sprints", async () => {
    const db = fakeDb({ "productBacklogItem.findMany": [] })
    await repo.findBacklogItems(db.client, "p1")
    const arg = db.fn("productBacklogItem.findMany").mock.calls[0][0]
    expect(arg.where).toEqual({ projectId: "p1", deletedAt: null })
    expect(arg.take).toBe(LIST_LIMITS.backlogItems)
    expect(arg.orderBy).toEqual([{ sortOrder: "asc" }, { createdAt: "asc" }])
    expect(arg.include.sprintItems.where).toEqual({ sprint: { status: { in: ["planning", "active"] } } })
    expect(arg.include.iceboxItem).toBeDefined()
    expect(arg.include.productGoal).toBeDefined()
  })

  it("findBacklogItems narrows by status when given", async () => {
    const db = fakeDb({ "productBacklogItem.findMany": [] })
    await repo.findBacklogItems(db.client, "p1", "ready")
    expect(db.fn("productBacklogItem.findMany").mock.calls[0][0].where).toEqual({ projectId: "p1", status: "ready", deletedAt: null })
  })

  it("findBacklogItem requires both id and projectId and skips the trash", async () => {
    const db = fakeDb()
    await repo.findBacklogItem(db.client, "p1", "b1")
    expect(db.fn("productBacklogItem.findFirst").mock.calls[0][0].where).toEqual({ id: "b1", projectId: "p1", deletedAt: null })
  })

  it("linked icebox request selects deletedAt so a trashed request can be hidden", async () => {
    const db = fakeDb({ "productBacklogItem.findMany": [] })
    await repo.findBacklogItems(db.client, "p1")
    expect(db.fn("productBacklogItem.findMany").mock.calls[0][0].include.iceboxItem.select.deletedAt).toBe(true)
  })

  it("nextBacklogNumbers counts trashed PBIs too (displayId is never reused)", async () => {
    const db = fakeDb({ "productBacklogItem.aggregate": { _max: { displayId: 1, sortOrder: 1 } } })
    await repo.nextBacklogNumbers(db.client, "p1")
    expect(db.fn("productBacklogItem.aggregate").mock.calls[0][0].where).toEqual({ projectId: "p1" })
  })

  it("softDeleteBacklogItem stamps only a live row of the project", async () => {
    const db = fakeDb({ "productBacklogItem.updateMany": { count: 1 } })
    const now = new Date("2026-10-01T00:00:00Z")
    await expect(repo.softDeleteBacklogItem(db.client, "p1", "b1", "u1", undefined, now)).resolves.toBe(true)
    expect(db.fn("productBacklogItem.updateMany")).toHaveBeenCalledWith({
      where: { id: "b1", projectId: "p1", deletedAt: null },
      data: { deletedAt: now, deletedById: "u1" },
    })
  })

  it("softDeleteBacklogItem only matches the expected version when one is given", async () => {
    const db = fakeDb({ "productBacklogItem.updateMany": { count: 1 } })
    const now = new Date("2026-10-01T00:00:00Z")
    await repo.softDeleteBacklogItem(db.client, "p1", "b1", "u1", 4, now)
    expect(db.fn("productBacklogItem.updateMany")).toHaveBeenCalledWith({
      where: { id: "b1", projectId: "p1", version: 4, deletedAt: null },
      data: { deletedAt: now, deletedById: "u1" },
    })
  })

  it("softDeleteBacklogItem reports false when nothing matched", async () => {
    const db = fakeDb({ "productBacklogItem.updateMany": { count: 0 } })
    await expect(repo.softDeleteBacklogItem(db.client, "p1", "b1", "u1")).resolves.toBe(false)
  })

  it("restoreBacklogItemRow clears the trash columns of a trashed row only", async () => {
    const db = fakeDb({ "productBacklogItem.updateMany": { count: 1 } })
    await expect(repo.restoreBacklogItemRow(db.client, "p1", "b1")).resolves.toBe(true)
    expect(db.fn("productBacklogItem.updateMany")).toHaveBeenCalledWith({
      where: { id: "b1", projectId: "p1", deletedAt: { not: null } },
      data: { deletedAt: null, deletedById: null },
    })
  })

  it("findTrashedBacklogItem / findTrashedBacklogItems only see the trash, newest first", async () => {
    const db = fakeDb({ "productBacklogItem.findMany": [] })
    await repo.findTrashedBacklogItem(db.client, "p1", "b1")
    await repo.findTrashedBacklogItems(db.client, "p1")
    expect(db.fn("productBacklogItem.findFirst").mock.calls[0][0].where).toEqual({
      id: "b1",
      projectId: "p1",
      deletedAt: { not: null },
    })
    const list = db.fn("productBacklogItem.findMany").mock.calls[0][0]
    expect(list.where).toEqual({ projectId: "p1", deletedAt: { not: null } })
    expect(list.orderBy).toEqual({ deletedAt: "desc" })
    expect(list.take).toBe(LIST_LIMITS.backlogItems)
  })

  it("findExpiredTrashedBacklogItems selects rows trashed before the cutoff", async () => {
    const db = fakeDb({ "productBacklogItem.findMany": [] })
    const cutoff = new Date("2026-09-01T00:00:00Z")
    await repo.findExpiredTrashedBacklogItems(db.client, cutoff, 50)
    expect(db.fn("productBacklogItem.findMany")).toHaveBeenCalledWith({
      where: { deletedAt: { lt: cutoff } },
      select: { id: true, projectId: true },
      orderBy: { deletedAt: "asc" },
      take: 50,
    })
  })

  it("findProjectIceboxItemId does not link to a trashed request", async () => {
    const db = fakeDb()
    await repo.findProjectIceboxItemId(db.client, "p1", "i1")
    expect(db.fn("iceboxItem.findFirst").mock.calls[0][0].where).toEqual({ id: "i1", projectId: "p1", deletedAt: null })
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

  it("updateBacklogItem is a compare-and-set on the version and bumps it", async () => {
    const db = fakeDb({ "productBacklogItem.updateMany": { count: 1 }, "productBacklogItem.findFirst": { id: "b1", version: 5 } })
    await expect(repo.updateBacklogItem(db.client, "p1", "b1", { epic: "e" }, 4)).resolves.toEqual({ id: "b1", version: 5 })
    expect(db.fn("productBacklogItem.updateMany")).toHaveBeenCalledWith({
      where: { id: "b1", projectId: "p1", version: 4, deletedAt: null },
      data: { epic: "e", version: { increment: 1 } },
    })
    expect(db.fn("productBacklogItem.findFirst")).toHaveBeenCalledWith({ where: { id: "b1", projectId: "p1" } })
  })

  it("updateBacklogItem without a version still bumps it; null when nothing matched", async () => {
    const db = fakeDb({ "productBacklogItem.updateMany": { count: 0 } })
    await expect(repo.updateBacklogItem(db.client, "p1", "b1", { epic: "e" })).resolves.toBeNull()
    expect(db.fn("productBacklogItem.updateMany")).toHaveBeenCalledWith({
      where: { id: "b1", projectId: "p1", deletedAt: null },
      data: { epic: "e", version: { increment: 1 } },
    })
    expect(db.fn("productBacklogItem.findFirst")).not.toHaveBeenCalled()
  })

  it("delete / setSortOrder are project-scoped (reorder skips the trash)", async () => {
    const db = fakeDb()
    await repo.deleteBacklogItem(db.client, "p1", "b1")
    await repo.setBacklogSortOrder(db.client, "p1", "b1", 5)
    expect(db.fn("productBacklogItem.delete")).toHaveBeenCalledWith({ where: { id: "b1", projectId: "p1" } })
    expect(db.fn("productBacklogItem.updateMany")).toHaveBeenCalledWith({
      where: { id: "b1", projectId: "p1", deletedAt: null },
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
