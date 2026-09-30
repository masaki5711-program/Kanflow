import { describe, expect, it } from "vitest"
import { fakeDb } from "@/services/__tests__/fake-db"
import { LIST_LIMITS } from "@/services/_shared/limits"
import * as repo from "../plan.repository"

describe("plan.repository", () => {
  it("reads are project-scoped", async () => {
    const db = fakeDb()
    await repo.findPlanItems(db.client, "p1")
    await repo.findPlanTree(db.client, "p1")
    await repo.findPlanItem(db.client, "p1", "x")
    await repo.findPlanItemsByIds(db.client, "p1", ["a", "b"])
    expect(db.fn("planItem.findMany")).toHaveBeenNthCalledWith(1, {
      where: { projectId: "p1" },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      take: LIST_LIMITS.planItems,
    })
    expect(db.fn("planItem.findMany")).toHaveBeenNthCalledWith(2, { where: { projectId: "p1" }, select: { id: true, parentId: true } })
    expect(db.fn("planItem.findFirst")).toHaveBeenCalledWith({ where: { id: "x", projectId: "p1" }, select: { id: true, parentId: true } })
    expect(db.fn("planItem.findMany")).toHaveBeenNthCalledWith(3, {
      where: { id: { in: ["a", "b"] }, projectId: "p1" },
      select: { id: true, parentId: true },
    })
  })

  it("nextPlanSortOrder aggregates within project and parent", async () => {
    const db = fakeDb({ "planItem.aggregate": { _max: { sortOrder: 9 } } })
    await expect(repo.nextPlanSortOrder(db.client, "p1", "par")).resolves.toBe(10)
    expect(db.fn("planItem.aggregate")).toHaveBeenCalledWith({ where: { projectId: "p1", parentId: "par" }, _max: { sortOrder: true } })
    const empty = fakeDb({ "planItem.aggregate": { _max: { sortOrder: null } } })
    await expect(repo.nextPlanSortOrder(empty.client, "p1", null)).resolves.toBe(1)
  })

  it("writes", async () => {
    const db = fakeDb({ "planItem.count": 3 })
    const data = { projectId: "p1", name: "n" } as never
    await repo.insertPlanItem(db.client, data)
    await repo.updatePlanItem(db.client, "x", { name: "m" })
    await expect(repo.countPlanChildren(db.client, "x")).resolves.toBe(3)
    await repo.deletePlanItem(db.client, "x")
    expect(db.fn("planItem.create")).toHaveBeenCalledWith({ data })
    expect(db.fn("planItem.update")).toHaveBeenCalledWith({ where: { id: "x" }, data: { name: "m" } })
    expect(db.fn("planItem.count")).toHaveBeenCalledWith({ where: { parentId: "x" } })
    expect(db.fn("planItem.delete")).toHaveBeenCalledWith({ where: { id: "x" } })
  })
})
