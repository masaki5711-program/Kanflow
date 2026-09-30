import { describe, expect, it } from "vitest"
import { fakeDb } from "@/services/__tests__/fake-db"
import { LIST_LIMITS } from "@/services/_shared/limits"
import * as repo from "../sprints.repository"

const WITH_ITEMS = { items: { where: { pbItem: { deletedAt: null } }, include: { pbItem: true } } }

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

  it("update / delete require the projectId", async () => {
    const db = fakeDb()
    await repo.updateSprint(db.client, "p1", "s1", { status: "done" })
    await repo.deleteSprint(db.client, "p1", "s1")
    expect(db.fn("sprint.update")).toHaveBeenCalledWith({ where: { id: "s1", projectId: "p1" }, data: { status: "done" }, include: WITH_ITEMS })
    expect(db.fn("sprint.delete")).toHaveBeenCalledWith({ where: { id: "s1", projectId: "p1" } })
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
})
