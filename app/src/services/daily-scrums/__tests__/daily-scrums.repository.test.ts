import { describe, expect, it } from "vitest"
import { fakeDb } from "@/services/__tests__/fake-db"
import { LIST_LIMITS } from "@/services/_shared/limits"
import * as repo from "../daily-scrums.repository"

describe("daily-scrums.repository", () => {
  it("findSprintId checks the sprint belongs to the project", async () => {
    const db = fakeDb()
    await repo.findSprintId(db.client, "p1", "s1")
    expect(db.fn("sprint.findFirst")).toHaveBeenCalledWith({ where: { id: "s1", projectId: "p1" }, select: { id: true } })
  })

  it("findNotes lists a sprint's notes newest first, bounded", async () => {
    const db = fakeDb()
    await repo.findNotes(db.client, "s1")
    expect(db.fn("dailyScrumNote.findMany")).toHaveBeenCalledWith({
      where: { sprintId: "s1" },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: LIST_LIMITS.dailyScrumNotes,
    })
  })

  it("findNoteId scopes through sprint -> project", async () => {
    const db = fakeDb()
    await repo.findNoteId(db.client, "p1", "s1", "n1")
    expect(db.fn("dailyScrumNote.findFirst")).toHaveBeenCalledWith({
      where: { id: "n1", sprintId: "s1", sprint: { projectId: "p1" } },
      select: { id: true },
    })
  })

  it("insert / update / delete", async () => {
    const db = fakeDb()
    const data = { sprintId: "s1", date: new Date(0), content: "c", author: null }
    await repo.insertNote(db.client, data)
    await repo.updateNote(db.client, "n1", { content: "x" })
    await repo.deleteNote(db.client, "n1")
    expect(db.fn("dailyScrumNote.create")).toHaveBeenCalledWith({ data })
    expect(db.fn("dailyScrumNote.update")).toHaveBeenCalledWith({ where: { id: "n1" }, data: { content: "x" } })
    expect(db.fn("dailyScrumNote.delete")).toHaveBeenCalledWith({ where: { id: "n1" } })
  })
})
