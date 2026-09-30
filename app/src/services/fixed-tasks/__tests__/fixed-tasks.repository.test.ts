import { describe, expect, it } from "vitest"
import { fakeDb } from "@/services/__tests__/fake-db"
import { LIST_LIMITS } from "@/services/_shared/limits"
import * as repo from "../fixed-tasks.repository"

const ORDER = [{ sortOrder: "asc" }, { createdAt: "asc" }]

describe("fixed-tasks.repository (user-scoped)", () => {
  it("findGroups only returns the user's groups", async () => {
    const db = fakeDb()
    await repo.findGroups(db.client, "u1")
    expect(db.fn("userFixedTask.findMany")).toHaveBeenCalledWith({
      where: { userId: "u1" },
      orderBy: ORDER,
      include: { items: { orderBy: ORDER } },
      take: LIST_LIMITS.fixedTasks,
    })
  })

  it("sort orders are max + 1 (1 when empty)", async () => {
    const db = fakeDb({
      "userFixedTask.aggregate": { _max: { sortOrder: 4 } },
      "userFixedTaskItem.aggregate": { _max: { sortOrder: null } },
    })
    await expect(repo.nextGroupSortOrder(db.client, "u1")).resolves.toBe(5)
    await expect(repo.nextItemSortOrder(db.client, "g1")).resolves.toBe(1)
    expect(db.fn("userFixedTask.aggregate")).toHaveBeenCalledWith({ where: { userId: "u1" }, _max: { sortOrder: true } })
    expect(db.fn("userFixedTaskItem.aggregate")).toHaveBeenCalledWith({ where: { groupId: "g1" }, _max: { sortOrder: true } })
  })

  it("ownership checks include the userId", async () => {
    const db = fakeDb()
    await repo.findOwnedGroup(db.client, "u1", "g1")
    await repo.findOwnedItem(db.client, "u1", "g1", "i1")
    expect(db.fn("userFixedTask.findFirst")).toHaveBeenCalledWith({ where: { id: "g1", userId: "u1" }, select: { id: true } })
    expect(db.fn("userFixedTaskItem.findFirst")).toHaveBeenCalledWith({
      where: { id: "i1", groupId: "g1", group: { userId: "u1" } },
      select: { id: true },
    })
  })

  it("group writes", async () => {
    const db = fakeDb()
    await repo.insertGroup(db.client, { userId: "u1", taskName: "t", sortOrder: 1 })
    await repo.updateGroup(db.client, "g1", { taskName: "x" })
    await repo.findItemIdsOfGroup(db.client, "g1")
    await repo.deleteGroup(db.client, "g1")
    expect(db.fn("userFixedTask.create")).toHaveBeenCalledWith({
      data: { userId: "u1", taskName: "t", sortOrder: 1 },
      include: { items: true },
    })
    expect(db.fn("userFixedTask.update")).toHaveBeenCalledWith({ where: { id: "g1" }, data: { taskName: "x" } })
    expect(db.fn("userFixedTaskItem.findMany")).toHaveBeenCalledWith({ where: { groupId: "g1" }, select: { id: true } })
    expect(db.fn("userFixedTask.delete")).toHaveBeenCalledWith({ where: { id: "g1" } })
  })

  it("item writes", async () => {
    const db = fakeDb()
    await repo.insertItem(db.client, { groupId: "g1", taskName: "t", sortOrder: 2 })
    await repo.updateItem(db.client, "i1", { sortOrder: 3 })
    await repo.deleteItem(db.client, "i1")
    expect(db.fn("userFixedTaskItem.create")).toHaveBeenCalledWith({ data: { groupId: "g1", taskName: "t", sortOrder: 2 } })
    expect(db.fn("userFixedTaskItem.update")).toHaveBeenCalledWith({ where: { id: "i1" }, data: { sortOrder: 3 } })
    expect(db.fn("userFixedTaskItem.delete")).toHaveBeenCalledWith({ where: { id: "i1" } })
  })
})
