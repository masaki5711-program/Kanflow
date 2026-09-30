import { describe, expect, it } from "vitest"
import { fakeDb } from "@/services/__tests__/fake-db"
import { LIST_LIMITS } from "@/services/_shared/limits"
import * as repo from "../events.repository"

describe("events.repository", () => {
  it("findEvents is project-scoped and bounded", async () => {
    const db = fakeDb()
    await repo.findEvents(db.client, "p1")
    expect(db.fn("calendarEvent.findMany")).toHaveBeenCalledWith({
      where: { projectId: "p1" },
      orderBy: { date: "asc" },
      take: LIST_LIMITS.calendarEvents,
    })
  })

  it("insert passes data; update / delete require the projectId", async () => {
    const db = fakeDb()
    const data = { projectId: "p1", title: "t", date: new Date(0) } as never
    await repo.insertEvent(db.client, data)
    await repo.updateEvent(db.client, "p1", "e1", { title: "u" })
    await repo.deleteEvent(db.client, "p1", "e1")
    expect(db.fn("calendarEvent.create")).toHaveBeenCalledWith({ data })
    expect(db.fn("calendarEvent.update")).toHaveBeenCalledWith({ where: { id: "e1", projectId: "p1" }, data: { title: "u" } })
    expect(db.fn("calendarEvent.delete")).toHaveBeenCalledWith({ where: { id: "e1", projectId: "p1" } })
  })

  it("findProjectSprintId is the cross-project guard", async () => {
    const db = fakeDb({ "sprint.findFirst": null })
    await expect(repo.findProjectSprintId(db.client, "p1", "s9")).resolves.toBeNull()
    expect(db.fn("sprint.findFirst")).toHaveBeenCalledWith({ where: { id: "s9", projectId: "p1" }, select: { id: true } })
  })
})
