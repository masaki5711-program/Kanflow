import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/services/_shared/translations", async () => (await import("@/services/__tests__/support")).translationMock())
vi.mock("../daily-scrums.repository")

const repo = await import("../daily-scrums.repository")
const tr = await import("@/services/_shared/translations")
const { ACTOR, TX } = await import("@/services/__tests__/support")
const svc = await import("../daily-scrums.service")

describe("daily-scrums.service", () => {
  beforeEach(() => vi.clearAllMocks())

  it("list requires the sprint to be in the project", async () => {
    vi.mocked(repo.findSprintId).mockResolvedValueOnce(null)
    await expect(svc.listNotes("p1", "s1")).rejects.toMatchObject({ status: 404 })
    vi.mocked(repo.findSprintId).mockResolvedValueOnce({ id: "s1" })
    vi.mocked(repo.findNotes).mockResolvedValueOnce([{ id: "n1" }] as never)
    await expect(svc.listNotes("p1", "s1")).resolves.toEqual([{ id: "n1", i18n: {} }])
  })

  it("create stamps the author and enqueues in the tx", async () => {
    vi.mocked(repo.findSprintId).mockResolvedValue({ id: "s1" })
    vi.mocked(repo.insertNote).mockResolvedValue({ id: "n1" } as never)
    await svc.createNote("p1", "s1", { date: "2026-01-01", content: "c" }, ACTOR)
    expect(repo.insertNote).toHaveBeenCalledWith(TX, { sprintId: "s1", date: new Date("2026-01-01"), content: "c", author: "Alice" })
    expect(tr.enqueueIn).toHaveBeenCalledWith(TX, "daily_scrum_note", "n1", { id: "n1" })
    await expect(svc.createNote("p1", "s1", { date: "bad", content: "c" }, ACTOR)).rejects.toMatchObject({ status: 400 })
  })

  it("create 404s for a foreign sprint", async () => {
    vi.mocked(repo.findSprintId).mockResolvedValue(null)
    await expect(svc.createNote("p1", "s1", { date: "2026-01-01", content: "c" }, ACTOR)).rejects.toThrow("Sprint not found")
  })

  it("buildNoteUpdate handles archive toggles and dates", () => {
    expect(svc.buildNoteUpdate({ archived: false })).toEqual({ archivedAt: null })
    expect(svc.buildNoteUpdate({ archived: true }).archivedAt).toBeInstanceOf(Date)
    expect(() => svc.buildNoteUpdate({ date: "bad" })).toThrow("日付が不正です")
  })

  it("update / delete check the note belongs to the sprint and project", async () => {
    vi.mocked(repo.findNoteId).mockResolvedValue(null)
    await expect(svc.updateNote("p1", "s1", "n", { content: "x" }, ACTOR)).rejects.toMatchObject({ status: 404 })
    await expect(svc.deleteNote("p1", "s1", "n")).rejects.toMatchObject({ status: 404 })
  })

  it("update enqueues content; delete purges", async () => {
    vi.mocked(repo.findNoteId).mockResolvedValue({ id: "n1" })
    vi.mocked(repo.updateNote).mockResolvedValue({ id: "n1" } as never)
    await svc.updateNote("p1", "s1", "n1", { content: "new" }, ACTOR)
    expect(tr.enqueueIn).toHaveBeenCalledWith(TX, "daily_scrum_note", "n1", { content: "new" })
    await svc.deleteNote("p1", "s1", "n1")
    expect(tr.purgeIn).toHaveBeenCalledWith(TX, { daily_scrum_note: ["n1"] })
  })
})
