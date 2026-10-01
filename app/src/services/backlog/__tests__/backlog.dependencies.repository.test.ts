import { describe, expect, it } from "vitest"
import { fakeDb } from "@/services/__tests__/fake-db"
import * as repo from "../backlog.dependencies.repository"

const LIVE_ENDS = { predecessor: { deletedAt: null }, successor: { deletedAt: null } } as const

describe("backlog.dependencies.repository", () => {
  it("findDependencyRows scopes by project, keeps only live-to-live links and orders by creation", async () => {
    const db = fakeDb({ "backlogItemDependency.findMany": [] })
    await repo.findDependencyRows(db.client, "p1")
    const arg = db.fn("backlogItemDependency.findMany").mock.calls[0][0]
    expect(arg.where).toEqual({ projectId: "p1", ...LIVE_ENDS })
    expect(arg.orderBy).toEqual({ createdAt: "asc" })
    expect(arg.select.predecessor.select).toMatchObject({ id: true, displayId: true, status: true })
  })

  it("findDependencyRows narrows to one PBI's links on either end when itemId is given", async () => {
    const db = fakeDb({ "backlogItemDependency.findMany": [] })
    await repo.findDependencyRows(db.client, "p1", "x")
    const arg = db.fn("backlogItemDependency.findMany").mock.calls[0][0]
    expect(arg.where).toEqual({ projectId: "p1", ...LIVE_ENDS, OR: [{ predecessorId: "x" }, { successorId: "x" }] })
  })

  it("findDependencyEdges returns every edge of the project, trashed ends included", async () => {
    const db = fakeDb({ "backlogItemDependency.findMany": [] })
    await repo.findDependencyEdges(db.client, "p1")
    expect(db.fn("backlogItemDependency.findMany")).toHaveBeenCalledWith({
      where: { projectId: "p1" },
      select: { predecessorId: true, successorId: true },
    })
  })

  it("findLivePbiIds returns a set of the ids that are live PBIs of the project", async () => {
    const db = fakeDb({ "productBacklogItem.findMany": [{ id: "a" }, { id: "b" }] })
    const out = await repo.findLivePbiIds(db.client, "p1", ["a", "b", "zz"])
    expect(out).toEqual(new Set(["a", "b"]))
    expect(db.fn("productBacklogItem.findMany")).toHaveBeenCalledWith({
      where: { projectId: "p1", deletedAt: null, id: { in: ["a", "b", "zz"] } },
      select: { id: true },
    })
  })

  it("insertDependency creates the link scoped to the project", async () => {
    const db = fakeDb({ "backlogItemDependency.create": { id: "d1", predecessorId: "a", successorId: "b" } })
    await repo.insertDependency(db.client, { projectId: "p1", predecessorId: "a", successorId: "b" })
    expect(db.fn("backlogItemDependency.create")).toHaveBeenCalledWith({
      data: { projectId: "p1", predecessorId: "a", successorId: "b" },
      select: { id: true, predecessorId: true, successorId: true },
    })
  })

  it("findDependency looks the link up scoped to the project", async () => {
    const db = fakeDb({ "backlogItemDependency.findFirst": null })
    await repo.findDependency(db.client, "p1", "d1")
    expect(db.fn("backlogItemDependency.findFirst")).toHaveBeenCalledWith({
      where: { id: "d1", projectId: "p1" },
      select: { id: true, predecessorId: true, successorId: true },
    })
  })

  it("deleteDependency deletes by id", async () => {
    const db = fakeDb({ "backlogItemDependency.delete": { id: "d1" } })
    await repo.deleteDependency(db.client, "d1")
    expect(db.fn("backlogItemDependency.delete")).toHaveBeenCalledWith({ where: { id: "d1" } })
  })
})
