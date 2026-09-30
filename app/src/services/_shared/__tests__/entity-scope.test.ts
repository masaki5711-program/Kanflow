import { describe, expect, it } from "vitest"
import { fakeDb } from "@/services/__tests__/fake-db"
import { resolveEntityScope } from "../entity-scope"

const LIVE = { "project.findFirst": { id: "p1" } }

describe("resolveEntityScope", () => {
  it.each([
    ["product_goal", "productGoal"],
    ["sprint", "sprint"],
    ["release_item", "releaseBacklogItem"],
    ["calendar_event", "calendarEvent"],
    ["plan_item", "planItem"],
  ] as const)("resolves %s to its project", async (type, model) => {
    const db = fakeDb({ [`${model}.findUnique`]: { projectId: "p1" }, ...LIVE })
    await expect(resolveEntityScope(db.client, type, "x")).resolves.toEqual({ kind: "project", projectId: "p1" })
    expect(db.fn(`${model}.findUnique`)).toHaveBeenCalledWith({ where: { id: "x" }, select: { projectId: true } })
    expect(db.fn("project.findFirst")).toHaveBeenCalledWith({ where: { id: "p1", deletedAt: null }, select: { id: true } })
  })

  it.each([
    ["icebox_item", "iceboxItem"],
    ["backlog_item", "productBacklogItem"],
    ["comment", "comment"],
  ] as const)("resolves a live %s and treats a trashed one as missing", async (type, model) => {
    const live = fakeDb({ [`${model}.findUnique`]: { projectId: "p1", deletedAt: null }, ...LIVE })
    await expect(resolveEntityScope(live.client, type, "x")).resolves.toEqual({ kind: "project", projectId: "p1" })
    expect(live.fn(`${model}.findUnique`)).toHaveBeenCalledWith({ where: { id: "x" }, select: { projectId: true, deletedAt: true } })
    const trashed = fakeDb({ [`${model}.findUnique`]: { projectId: "p1", deletedAt: new Date() }, ...LIVE })
    await expect(resolveEntityScope(trashed.client, type, "x")).resolves.toBeNull()
  })

  it("resolves a project to itself when it exists and is not in the trash", async () => {
    const db = fakeDb(LIVE)
    await expect(resolveEntityScope(db.client, "project", "p1")).resolves.toEqual({ kind: "project", projectId: "p1" })
    await expect(resolveEntityScope(fakeDb().client, "project", "p1")).resolves.toBeNull()
  })

  it("treats every entity of a trashed project as missing", async () => {
    const db = fakeDb({ "sprint.findUnique": { projectId: "p1" }, "project.findFirst": null })
    await expect(resolveEntityScope(db.client, "sprint", "s")).resolves.toBeNull()
  })

  it("resolves sprint children through their sprint", async () => {
    const notes = fakeDb({ "dailyScrumNote.findUnique": { sprint: { projectId: "p2" } }, "project.findFirst": { id: "p2" } })
    await expect(resolveEntityScope(notes.client, "daily_scrum_note", "n")).resolves.toEqual({ kind: "project", projectId: "p2" })
    const tasks = fakeDb({ "sprintBacklogItem.findUnique": { sprint: { projectId: "p3" } }, "project.findFirst": { id: "p3" } })
    await expect(resolveEntityScope(tasks.client, "sprint_task", "t")).resolves.toEqual({ kind: "project", projectId: "p3" })
  })

  it("resolves personal fixed tasks to their owner", async () => {
    const group = fakeDb({ "userFixedTask.findUnique": { userId: "u1" } })
    await expect(resolveEntityScope(group.client, "fixed_task", "g")).resolves.toEqual({ kind: "user", userId: "u1" })
    const item = fakeDb({ "userFixedTaskItem.findUnique": { group: { userId: "u2" } } })
    await expect(resolveEntityScope(item.client, "fixed_task_item", "i")).resolves.toEqual({ kind: "user", userId: "u2" })
  })

  it("returns null for missing entities", async () => {
    const db = fakeDb()
    await expect(resolveEntityScope(db.client, "backlog_item", "x")).resolves.toBeNull()
    await expect(resolveEntityScope(db.client, "sprint_task", "x")).resolves.toBeNull()
    await expect(resolveEntityScope(db.client, "fixed_task_item", "x")).resolves.toBeNull()
  })
})
