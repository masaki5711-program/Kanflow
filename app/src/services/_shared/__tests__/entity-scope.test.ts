import { describe, expect, it } from "vitest"
import { fakeDb } from "@/services/__tests__/fake-db"
import { resolveEntityScope } from "../entity-scope"

describe("resolveEntityScope", () => {
  it.each([
    ["product_goal", "productGoal"],
    ["icebox_item", "iceboxItem"],
    ["backlog_item", "productBacklogItem"],
    ["sprint", "sprint"],
    ["release_item", "releaseBacklogItem"],
    ["calendar_event", "calendarEvent"],
    ["plan_item", "planItem"],
  ] as const)("resolves %s to its project", async (type, model) => {
    const db = fakeDb({ [`${model}.findUnique`]: { projectId: "p1" } })
    await expect(resolveEntityScope(db.client, type, "x")).resolves.toEqual({ kind: "project", projectId: "p1" })
    expect(db.fn(`${model}.findUnique`)).toHaveBeenCalledWith({ where: { id: "x" }, select: { projectId: true } })
  })

  it("resolves a project to itself when it exists", async () => {
    const db = fakeDb({ "project.findUnique": { id: "p1" } })
    await expect(resolveEntityScope(db.client, "project", "p1")).resolves.toEqual({ kind: "project", projectId: "p1" })
    await expect(resolveEntityScope(fakeDb().client, "project", "p1")).resolves.toBeNull()
  })

  it("resolves sprint children through their sprint", async () => {
    const notes = fakeDb({ "dailyScrumNote.findUnique": { sprint: { projectId: "p2" } } })
    await expect(resolveEntityScope(notes.client, "daily_scrum_note", "n")).resolves.toEqual({ kind: "project", projectId: "p2" })
    const tasks = fakeDb({ "sprintBacklogItem.findUnique": { sprint: { projectId: "p3" } } })
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
