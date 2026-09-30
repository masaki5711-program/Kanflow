import { describe, expect, it, vi } from "vitest"
import { fakeDb } from "@/services/__tests__/fake-db"
import { LIST_LIMITS } from "@/services/_shared/limits"
import * as repo from "../plan.repository"

const OWNER = { owner: { select: { id: true, name: true } } }

describe("plan.repository", () => {
  it("live reads are project-scoped and exclude the trash", async () => {
    const db = fakeDb()
    await repo.findPlanItems(db.client, "p1")
    await repo.findPlanTree(db.client, "p1")
    await repo.findPlanItem(db.client, "p1", "x")
    await repo.findPlanItemsByIds(db.client, "p1", ["a", "b"])
    expect(db.fn("planItem.findMany")).toHaveBeenNthCalledWith(1, {
      where: { projectId: "p1", deletedAt: null },
      include: OWNER,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      take: LIST_LIMITS.planItems,
    })
    expect(db.fn("planItem.findMany")).toHaveBeenNthCalledWith(2, { where: { projectId: "p1", deletedAt: null }, select: { id: true, parentId: true } })
    expect(db.fn("planItem.findFirst")).toHaveBeenCalledWith({ where: { id: "x", projectId: "p1", deletedAt: null }, include: OWNER })
    expect(db.fn("planItem.findMany")).toHaveBeenNthCalledWith(3, {
      where: { id: { in: ["a", "b"] }, projectId: "p1", deletedAt: null },
      select: { id: true, parentId: true },
    })
  })

  it("nextPlanSortOrder aggregates within project and parent", async () => {
    const db = fakeDb({ "planItem.aggregate": { _max: { sortOrder: 9 } } })
    await expect(repo.nextPlanSortOrder(db.client, "p1", "par")).resolves.toBe(10)
    const empty = fakeDb({ "planItem.aggregate": { _max: { sortOrder: null } } })
    await expect(repo.nextPlanSortOrder(empty.client, "p1", null)).resolves.toBe(1)
  })

  it("versioned update matches the version, bumps it and reports misses", async () => {
    const hit = fakeDb({ "planItem.updateMany": { count: 1 }, "planItem.findFirst": { id: "x" } })
    await expect(repo.updatePlanItemVersioned(hit.client, "p1", "x", { name: "m" }, 3)).resolves.toEqual({ id: "x" })
    expect(hit.fn("planItem.updateMany")).toHaveBeenCalledWith({
      where: { id: "x", projectId: "p1", deletedAt: null, version: 3 },
      data: { name: "m", version: { increment: 1 } },
    })
    const miss = fakeDb({ "planItem.updateMany": { count: 0 } })
    await expect(repo.updatePlanItemVersioned(miss.client, "p1", "x", { name: "m" })).resolves.toBeNull()
    expect(miss.fn("planItem.updateMany").mock.calls[0][0].where).toEqual({ id: "x", projectId: "p1", deletedAt: null })
  })

  it("writes and counts", async () => {
    const db = fakeDb({ "planItem.count": 3 })
    const data = { projectId: "p1", name: "n" } as never
    await repo.insertPlanItem(db.client, data)
    await repo.updatePlanItem(db.client, "x", { name: "m" })
    await expect(repo.countPlanChildren(db.client, "x")).resolves.toBe(3)
    await repo.deletePlanItemHard(db.client, "p1", "x")
    expect(db.fn("planItem.create")).toHaveBeenCalledWith({ data })
    expect(db.fn("planItem.update")).toHaveBeenCalledWith({ where: { id: "x" }, data: { name: "m" } })
    expect(db.fn("planItem.count")).toHaveBeenCalledWith({ where: { parentId: "x", deletedAt: null } })
    expect(db.fn("planItem.delete")).toHaveBeenCalledWith({ where: { id: "x", projectId: "p1" } })
  })

  it("trash: soft delete (versioned root), restore, trashed lookups", async () => {
    const now = new Date("2026-10-01T00:00:00Z")
    const db = fakeDb({ "planItem.updateMany": { count: 2 } })
    await expect(repo.softDeletePlanItems(db.client, "p1", ["a", "b"], "u1", now, 4)).resolves.toBe(2)
    expect(db.fn("planItem.updateMany")).toHaveBeenNthCalledWith(1, {
      where: { id: { in: ["a", "b"] }, projectId: "p1", deletedAt: null, version: 4 },
      data: { deletedAt: now, deletedById: "u1", version: { increment: 1 } },
    })
    await repo.restorePlanItems(db.client, "p1", ["a"])
    expect(db.fn("planItem.updateMany")).toHaveBeenNthCalledWith(2, {
      where: { id: { in: ["a"] }, projectId: "p1", deletedAt: { not: null } },
      data: { deletedAt: null, deletedById: null },
    })
    await repo.findTrashedPlanItem(db.client, "p1", "a")
    expect(db.fn("planItem.findFirst").mock.calls[0][0].where).toEqual({ id: "a", projectId: "p1", deletedAt: { not: null } })
  })

  it("expired trash picks the top of each purge (no parent, live parent, or parent still retained)", async () => {
    const cutoff = new Date("2026-09-01T00:00:00Z")
    const db = fakeDb()
    await repo.findExpiredTrashedPlanItems(db.client, cutoff, 50)
    expect(db.fn("planItem.findMany")).toHaveBeenCalledWith({
      where: {
        deletedAt: { lt: cutoff },
        OR: [{ parentId: null }, { parent: { OR: [{ deletedAt: null }, { deletedAt: { gte: cutoff } }] } }],
      },
      select: { id: true, projectId: true },
      orderBy: { deletedAt: "asc" },
      take: 50,
    })
  })

  it("PBI links are scoped to live PBIs of the project and bump versions", async () => {
    const db = fakeDb({ "productBacklogItem.updateMany": { count: 2 } })
    await expect(repo.setPbiPlanItem(db.client, "p1", ["b1", "b2"], "pl")).resolves.toBe(2)
    expect(db.fn("productBacklogItem.updateMany")).toHaveBeenCalledWith({
      where: { projectId: "p1", id: { in: ["b1", "b2"] }, deletedAt: null },
      data: { planItemId: "pl", version: { increment: 1 } },
    })
    await expect(repo.setPbiPlanItem(db.client, "p1", [], null)).resolves.toBe(0)
    await repo.findLinkedPbisOfProject(db.client, "p1")
    expect(db.fn("productBacklogItem.findMany").mock.calls[0][0].where).toEqual({ projectId: "p1", planItemId: { not: null }, deletedAt: null })
  })

  it("linkable PBIs search text and display id", async () => {
    const db = fakeDb()
    await repo.findLinkablePbis(db.client, "p1", "12", 12)
    const where = db.fn("productBacklogItem.findMany").mock.calls[0][0].where
    expect(where.projectId).toBe("p1")
    expect(where.deletedAt).toBeNull()
    expect(where.OR).toEqual([{ displayId: 12 }, { initiative: { contains: "12" } }, { epic: { contains: "12" } }, { userStory: { contains: "12" } }])
    expect(db.fn("productBacklogItem.findMany").mock.calls[0][0].take).toBe(repo.LINKABLE_LIMIT)
    await repo.findLinkablePbis(db.client, "p1", undefined, null)
    expect(db.fn("productBacklogItem.findMany").mock.calls[1][0].where).toEqual({ projectId: "p1", deletedAt: null })
  })

  it("baseline copy is one parameterized statement; clear only touches rows with a baseline", async () => {
    const executeRaw = vi.fn(async () => 4)
    await expect(repo.copyBaseline({ $executeRaw: executeRaw } as never, "p1", ["a", "b"])).resolves.toBe(4)
    const [strings, ...values] = executeRaw.mock.calls[0] as unknown as [string[], ...unknown[]]
    expect(strings.join("?")).toContain("SET `baselineStart` = `plannedStart`, `baselineEnd` = `plannedEnd`")
    expect(strings.join("?")).toContain("`deletedAt` IS NULL")
    expect(values[0]).toBe("p1")
    expect(JSON.stringify(values[1])).toContain("a")
    await repo.copyBaseline({ $executeRaw: executeRaw } as never, "p1")
    const db = fakeDb({ "planItem.updateMany": { count: 1 } })
    await expect(repo.clearBaseline(db.client, "p1")).resolves.toBe(1)
    expect(db.fn("planItem.updateMany")).toHaveBeenCalledWith({
      where: { projectId: "p1", deletedAt: null, OR: [{ baselineStart: { not: null } }, { baselineEnd: { not: null } }] },
      data: { baselineStart: null, baselineEnd: null },
    })
  })

  it("dependencies", async () => {
    const db = fakeDb()
    await repo.findDependencies(db.client, "p1")
    await repo.insertDependency(db.client, { projectId: "p1", predecessorId: "a", successorId: "b" })
    await repo.findDependency(db.client, "p1", "d1")
    await repo.deleteDependency(db.client, "d1")
    expect(db.fn("planItemDependency.findMany").mock.calls[0][0].where).toEqual({ projectId: "p1" })
    expect(db.fn("planItemDependency.findFirst").mock.calls[0][0].where).toEqual({ id: "d1", projectId: "p1" })
    expect(db.fn("planItemDependency.delete")).toHaveBeenCalledWith({ where: { id: "d1" } })
  })
})
