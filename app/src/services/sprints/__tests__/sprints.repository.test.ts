import { describe, expect, it } from "vitest"
import { fakeDb } from "@/services/__tests__/fake-db"
import { LIST_LIMITS } from "@/services/_shared/limits"
import * as repo from "../sprints.repository"

const ASSIGNEES = { select: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } }
const WITH_ITEMS = { items: { where: { pbItem: { deletedAt: null } }, include: { pbItem: true, assignees: ASSIGNEES } } }

describe("sprints.repository", () => {
  it("findSprints is project-scoped, newest first, bounded", async () => {
    const db = fakeDb()
    await repo.findSprints(db.client, "p1")
    const arg = db.fn("sprint.findMany").mock.calls[0][0]
    expect(arg.where).toEqual({ projectId: "p1" })
    expect(arg.orderBy).toEqual([{ startDate: "desc" }, { createdAt: "desc" }])
    expect(arg.take).toBe(LIST_LIMITS.sprints)
    expect(arg.include.items.orderBy).toEqual({ createdAt: "asc" })
    expect(arg.include.items.where).toEqual({ pbItem: { deletedAt: null } })
    expect(arg.include.items.include.assignees).toEqual(ASSIGNEES)
  })

  it("single-sprint lookups require the projectId", async () => {
    const db = fakeDb()
    await repo.findSprintDetail(db.client, "p1", "s1")
    await repo.findSprintId(db.client, "p1", "s1")
    expect(db.fn("sprint.findFirst")).toHaveBeenNthCalledWith(1, { where: { id: "s1", projectId: "p1" }, include: WITH_ITEMS })
    expect(db.fn("sprint.findFirst")).toHaveBeenNthCalledWith(2, { where: { id: "s1", projectId: "p1" }, select: { id: true } })
  })

  it("findOpenSprint looks for planning / active sprints in the project", async () => {
    const db = fakeDb()
    await repo.findOpenSprint(db.client, "p1")
    expect(db.fn("sprint.findFirst")).toHaveBeenCalledWith({
      where: { projectId: "p1", status: { in: ["planning", "active"] } },
      select: { id: true, sprintName: true, status: true },
    })
  })

  it("findProjectPbiIds is project-scoped", async () => {
    const db = fakeDb()
    await repo.findProjectPbiIds(db.client, "p1", ["b1"])
    expect(db.fn("productBacklogItem.findMany")).toHaveBeenCalledWith({
      where: { id: { in: ["b1"] }, projectId: "p1", deletedAt: null },
      select: { id: true },
    })
  })

  it("insertSprint creates placeholder rows only when PBIs are given", async () => {
    const db = fakeDb()
    const data = { projectId: "p1", sprintName: "S" } as never
    await repo.insertSprint(db.client, data, ["b1", "b2"])
    await repo.insertSprint(db.client, data, [])
    expect(db.fn("sprint.create")).toHaveBeenNthCalledWith(1, {
      data: {
        projectId: "p1",
        sprintName: "S",
        items: { create: [{ pbItemId: "b1", status: "todo" }, { pbItemId: "b2", status: "todo" }] },
      },
      include: WITH_ITEMS,
    })
    expect(db.fn("sprint.create")).toHaveBeenNthCalledWith(2, {
      data: { projectId: "p1", sprintName: "S", items: undefined },
      include: WITH_ITEMS,
    })
  })

  it("updateSprint is a project-scoped version compare-and-set that bumps the version", async () => {
    const db = fakeDb({ "sprint.updateMany": { count: 1 }, "sprint.findFirst": { id: "s1", version: 4 } })
    await expect(repo.updateSprint(db.client, "p1", "s1", { status: "done" }, 3)).resolves.toEqual({ id: "s1", version: 4 })
    expect(db.fn("sprint.updateMany")).toHaveBeenCalledWith({
      where: { id: "s1", projectId: "p1", version: 3 },
      data: { status: "done", version: { increment: 1 } },
    })
    expect(db.fn("sprint.findFirst")).toHaveBeenCalledWith({ where: { id: "s1", projectId: "p1" }, include: WITH_ITEMS })
  })

  it("updateSprint without a version still bumps it; null when nothing matched", async () => {
    const db = fakeDb({ "sprint.updateMany": { count: 0 } })
    await expect(repo.updateSprint(db.client, "p1", "s1", { status: "done" })).resolves.toBeNull()
    expect(db.fn("sprint.updateMany")).toHaveBeenCalledWith({
      where: { id: "s1", projectId: "p1" },
      data: { status: "done", version: { increment: 1 } },
    })
  })

  it("deleteSprint is project-scoped, checks the version when given and returns the count", async () => {
    const db = fakeDb({ "sprint.deleteMany": { count: 1 } })
    await expect(repo.deleteSprint(db.client, "p1", "s1")).resolves.toBe(1)
    expect(db.fn("sprint.deleteMany")).toHaveBeenCalledWith({ where: { id: "s1", projectId: "p1" } })
    await repo.deleteSprint(db.client, "p1", "s1", 2)
    expect(db.fn("sprint.deleteMany")).toHaveBeenLastCalledWith({ where: { id: "s1", projectId: "p1", version: 2 } })
  })

  it("findSprintChildren returns tasks and notes", async () => {
    const db = fakeDb({
      "sprintBacklogItem.findMany": [{ id: "t1", pbItemId: "b1" }],
      "dailyScrumNote.findMany": [{ id: "n1" }],
    })
    await expect(repo.findSprintChildren(db.client, "s1")).resolves.toEqual({
      tasks: [{ id: "t1", pbItemId: "b1" }],
      notes: [{ id: "n1" }],
    })
    expect(db.fn("sprintBacklogItem.findMany")).toHaveBeenCalledWith({ where: { sprintId: "s1" }, select: { id: true, pbItemId: true } })
    expect(db.fn("dailyScrumNote.findMany")).toHaveBeenCalledWith({ where: { sprintId: "s1" }, select: { id: true } })
  })

  it("findBurndownSprints excludes archived sprints and is bounded", async () => {
    const db = fakeDb()
    await repo.findBurndownSprints(db.client, "p1")
    const arg = db.fn("sprint.findMany").mock.calls[0][0]
    expect(arg.where).toEqual({ projectId: "p1", status: { in: ["planning", "active", "review", "done"] } })
    expect(arg.take).toBe(LIST_LIMITS.burndownSprints)
    expect(arg.orderBy).toEqual({ startDate: "desc" })
    expect(arg.select.items.where).toEqual({ pbItem: { deletedAt: null } })
  })

  it("findBurndownSprint scopes one non-planning, non-archived sprint to the project", async () => {
    const db = fakeDb()
    await repo.findBurndownSprint(db.client, "p1", "s1")
    const arg = db.fn("sprint.findFirst").mock.calls[0][0]
    expect(arg.where).toEqual({ id: "s1", projectId: "p1", status: { in: ["active", "review", "done"] } })
    expect(arg.select.items).toEqual({ where: { pbItem: { deletedAt: null } }, select: { taskName: true, status: true, completedAt: true } })
  })
})
