import { beforeEach, describe, expect, it, vi } from "vitest"
import { asRole, ctx, getReq, jsonReq } from "./a2-helpers"

const m = vi.hoisted(() => ({
  authMock: vi.fn(),
  memberFindFirst: vi.fn(),
  listSprints: vi.fn(),
  createSprint: vi.fn(),
  getSprint: vi.fn(),
  updateSprint: vi.fn(),
  deleteSprint: vi.fn(),
  listNotes: vi.fn(),
  createNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
  addPbisToSprint: vi.fn(),
  removePbiFromSprint: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({ auth: () => m.authMock() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectMember: { findFirst: (...a: unknown[]) => m.memberFindFirst(...a) },
    projectSection: { findFirst: vi.fn().mockResolvedValue(null) },
    project: { findFirst: vi.fn().mockResolvedValue({ id: "live" }) },
  },
}))
vi.mock("@/services/sprints/sprints.service", () => ({
  listSprints: m.listSprints,
  createSprint: m.createSprint,
  getSprint: m.getSprint,
  updateSprint: m.updateSprint,
  deleteSprint: m.deleteSprint,
}))
vi.mock("@/services/daily-scrums/daily-scrums.service", () => ({
  listNotes: m.listNotes,
  createNote: m.createNote,
  updateNote: m.updateNote,
  deleteNote: m.deleteNote,
}))
vi.mock("@/services/sprint-backlog/sprint-backlog.service", () => ({
  addPbisToSprint: m.addPbisToSprint,
  removePbiFromSprint: m.removePbiFromSprint,
  createTask: m.createTask,
  updateTask: m.updateTask,
  deleteTask: m.deleteTask,
}))

const sprints = await import("../sprints/route")
const sprint = await import("../sprints/[sprintId]/route")
const notes = await import("../sprints/[sprintId]/daily-scrums/route")
const note = await import("../sprints/[sprintId]/daily-scrums/[noteId]/route")
const pbis = await import("../sprints/[sprintId]/pbis/route")
const tasks = await import("../sprints/[sprintId]/tasks/route")
const task = await import("../sprints/[sprintId]/tasks/[taskId]/route")
const { ConflictError, NotFoundError, ValidationError } = await import("@/services/_shared/errors")

const P = ctx({ projectId: "p1" })
const PS = ctx({ projectId: "p1", sprintId: "s1" })
const PSN = ctx({ projectId: "p1", sprintId: "s1", noteId: "n1" })
const PST = ctx({ projectId: "p1", sprintId: "s1", taskId: "t1" })
const actor = { userId: "user-1", userName: "Taro", systemRole: "member" }

describe("sprint routes", () => {
  beforeEach(() => {
    Object.values(m).forEach((f) => f.mockReset())
  })

  describe("/sprints", () => {
    const body = { sprintName: "S1", startDate: "2026-01-01", endDate: "2026-01-14" }

    it("GET 401 without session", async () => {
      asRole(m, "none")
      expect((await sprints.GET(getReq(), P)).status).toBe(401)
    })

    it("GET 404 for non-member", async () => {
      asRole(m, "outsider")
      expect((await sprints.GET(getReq(), P)).status).toBe(404)
      expect(m.listSprints).not.toHaveBeenCalled()
    })

    it("GET lists sprints", async () => {
      asRole(m, "dev")
      m.listSprints.mockResolvedValue([{ id: "s1" }])
      const res = await sprints.GET(getReq(), P)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual([{ id: "s1" }])
    })

    it("GET 500 on failure", async () => {
      asRole(m, "dev")
      m.listSprints.mockRejectedValue(new Error("x"))
      expect((await sprints.GET(getReq(), P)).status).toBe(500)
    })

    it("POST 403 for dev (sprint.manage)", async () => {
      asRole(m, "dev")
      expect((await sprints.POST(jsonReq("POST", body), P)).status).toBe(403)
    })

    it("POST creates (201)", async () => {
      asRole(m, "sm")
      m.createSprint.mockResolvedValue({ id: "s2" })
      const res = await sprints.POST(jsonReq("POST", { ...body, capacity: 10, selectedPbIds: ["pb1"] }), P)
      expect(res.status).toBe(201)
      expect(m.createSprint).toHaveBeenCalledWith("p1", { ...body, capacity: 10, selectedPbIds: ["pb1"] }, actor)
    })

    it("POST 400 on negative capacity", async () => {
      asRole(m, "sm")
      expect((await sprints.POST(jsonReq("POST", { ...body, capacity: -1 }), P)).status).toBe(400)
      expect(m.createSprint).not.toHaveBeenCalled()
    })

    it("POST maps ConflictError to 409", async () => {
      asRole(m, "po")
      m.createSprint.mockRejectedValue(new ConflictError("dup"))
      const res = await sprints.POST(jsonReq("POST", body), P)
      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({ error: "dup", code: "CONFLICT" })
    })
  })

  describe("/sprints/[sprintId]", () => {
    it("GET returns the sprint", async () => {
      asRole(m, "dev")
      m.getSprint.mockResolvedValue({ id: "s1" })
      const res = await sprint.GET(getReq(), PS)
      expect(res.status).toBe(200)
      expect(m.getSprint).toHaveBeenCalledWith("p1", "s1")
    })

    it("GET 404 when service throws NotFoundError", async () => {
      asRole(m, "dev")
      m.getSprint.mockRejectedValue(new NotFoundError())
      expect((await sprint.GET(getReq(), PS)).status).toBe(404)
    })

    it("GET 404 for non-member", async () => {
      asRole(m, "outsider")
      expect((await sprint.GET(getReq(), PS)).status).toBe(404)
      expect(m.getSprint).not.toHaveBeenCalled()
    })

    it("PATCH 401 without session", async () => {
      asRole(m, "none")
      expect((await sprint.PATCH(jsonReq("PATCH", { status: "done" }), PS)).status).toBe(401)
    })

    it("PATCH updates status", async () => {
      asRole(m, "po")
      m.updateSprint.mockResolvedValue({ id: "s1", status: "done" })
      const res = await sprint.PATCH(jsonReq("PATCH", { status: "done", sprintGoal: null }), PS)
      expect(res.status).toBe(200)
      expect(m.updateSprint).toHaveBeenCalledWith("p1", "s1", { status: "done", sprintGoal: null }, actor)
    })

    it("PATCH 400 on unknown status", async () => {
      asRole(m, "po")
      expect((await sprint.PATCH(jsonReq("PATCH", { status: "closed" }), PS)).status).toBe(400)
    })

    it("PATCH 500 on unexpected error", async () => {
      asRole(m, "po")
      m.updateSprint.mockRejectedValue(new Error("x"))
      expect((await sprint.PATCH(jsonReq("PATCH", { status: "done" }), PS)).status).toBe(500)
    })

    it("DELETE 403 for dev", async () => {
      asRole(m, "dev")
      expect((await sprint.DELETE(getReq(), PS)).status).toBe(403)
      expect(m.deleteSprint).not.toHaveBeenCalled()
    })

    it("DELETE succeeds", async () => {
      asRole(m, "sm")
      const res = await sprint.DELETE(getReq(), PS)
      expect(res.status).toBe(200)
      expect(m.deleteSprint).toHaveBeenCalledWith("p1", "s1", expect.objectContaining({ userId: expect.any(String) }), undefined)
    })

    it("DELETE 500 on failure", async () => {
      asRole(m, "sm")
      m.deleteSprint.mockRejectedValue(new Error("x"))
      expect((await sprint.DELETE(getReq(), PS)).status).toBe(500)
    })
  })

  describe("/sprints/[sprintId]/daily-scrums", () => {
    it("GET 401 without session", async () => {
      asRole(m, "none")
      expect((await notes.GET(getReq(), PS)).status).toBe(401)
    })

    it("GET lists notes", async () => {
      asRole(m, "dev")
      m.listNotes.mockResolvedValue([])
      const res = await notes.GET(getReq(), PS)
      expect(res.status).toBe(200)
      expect(m.listNotes).toHaveBeenCalledWith("p1", "s1")
    })

    it("GET 500 on failure", async () => {
      asRole(m, "dev")
      m.listNotes.mockRejectedValue(new Error("x"))
      expect((await notes.GET(getReq(), PS)).status).toBe(500)
    })

    it("POST creates note for any member", async () => {
      asRole(m, "dev")
      m.createNote.mockResolvedValue({ id: "n1" })
      const res = await notes.POST(jsonReq("POST", { date: "2026-01-02", content: "hi" }), PS)
      expect(res.status).toBe(201)
      expect(m.createNote).toHaveBeenCalledWith("p1", "s1", { date: "2026-01-02", content: "hi" }, actor)
    })

    it("POST 400 on empty content", async () => {
      asRole(m, "dev")
      expect((await notes.POST(jsonReq("POST", { date: "2026-01-02", content: "" }), PS)).status).toBe(400)
    })

    it("POST 404 for non-member", async () => {
      asRole(m, "outsider")
      expect((await notes.POST(jsonReq("POST", { date: "d", content: "c" }), PS)).status).toBe(404)
    })

    it("PATCH note", async () => {
      asRole(m, "dev")
      m.updateNote.mockResolvedValue({ id: "n1", archived: true })
      const res = await note.PATCH(jsonReq("PATCH", { archived: true }), PSN)
      expect(res.status).toBe(200)
      expect(m.updateNote).toHaveBeenCalledWith("p1", "s1", "n1", { archived: true }, actor)
    })

    it("PATCH 400 on wrong type", async () => {
      asRole(m, "dev")
      expect((await note.PATCH(jsonReq("PATCH", { archived: "yes" }), PSN)).status).toBe(400)
    })

    it("PATCH 401 without session", async () => {
      asRole(m, "none")
      expect((await note.PATCH(jsonReq("PATCH", { archived: true }), PSN)).status).toBe(401)
    })

    it("DELETE note", async () => {
      asRole(m, "dev")
      const res = await note.DELETE(getReq(), PSN)
      expect(res.status).toBe(200)
      expect(m.deleteNote).toHaveBeenCalledWith("p1", "s1", "n1")
    })

    it("DELETE 404 when not found", async () => {
      asRole(m, "dev")
      m.deleteNote.mockRejectedValue(new NotFoundError())
      expect((await note.DELETE(getReq(), PSN)).status).toBe(404)
    })

    it("DELETE 404 for non-member", async () => {
      asRole(m, "outsider")
      expect((await note.DELETE(getReq(), PSN)).status).toBe(404)
      expect(m.deleteNote).not.toHaveBeenCalled()
    })
  })

  describe("/sprints/[sprintId]/pbis", () => {
    it("POST 201 when PBIs added", async () => {
      asRole(m, "po")
      m.addPbisToSprint.mockResolvedValue({ added: 2 })
      const res = await pbis.POST(jsonReq("POST", { pbIds: ["a", "b"] }), PS)
      expect(res.status).toBe(201)
      expect(m.addPbisToSprint).toHaveBeenCalledWith("p1", "s1", ["a", "b"], expect.objectContaining({ userId: expect.any(String) }))
    })

    it("POST 200 when nothing was added", async () => {
      asRole(m, "po")
      m.addPbisToSprint.mockResolvedValue({ added: 0 })
      expect((await pbis.POST(jsonReq("POST", { pbIds: ["a"] }), PS)).status).toBe(200)
    })

    it("POST 400 when more than 50 ids", async () => {
      asRole(m, "po")
      const ids = Array.from({ length: 51 }, (_, i) => `pb${i}`)
      expect((await pbis.POST(jsonReq("POST", { pbIds: ids }), PS)).status).toBe(400)
      expect(m.addPbisToSprint).not.toHaveBeenCalled()
    })

    it("POST 403 for dev", async () => {
      asRole(m, "dev")
      expect((await pbis.POST(jsonReq("POST", { pbIds: ["a"] }), PS)).status).toBe(403)
    })

    it("DELETE removes a PBI", async () => {
      asRole(m, "sm")
      m.removePbiFromSprint.mockResolvedValue({ removed: 3 })
      const res = await pbis.DELETE(jsonReq("DELETE", { pbItemId: "a" }), PS)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ removed: 3 })
      expect(m.removePbiFromSprint).toHaveBeenCalledWith("p1", "s1", "a", expect.objectContaining({ userId: expect.any(String) }))
    })

    it("DELETE 400 without pbItemId", async () => {
      asRole(m, "sm")
      expect((await pbis.DELETE(jsonReq("DELETE", {}), PS)).status).toBe(400)
    })

    it("DELETE 401 without session", async () => {
      asRole(m, "none")
      expect((await pbis.DELETE(jsonReq("DELETE", { pbItemId: "a" }), PS)).status).toBe(401)
    })

    it("DELETE 500 on failure", async () => {
      asRole(m, "sm")
      m.removePbiFromSprint.mockRejectedValue(new Error("x"))
      expect((await pbis.DELETE(jsonReq("DELETE", { pbItemId: "a" }), PS)).status).toBe(500)
    })
  })

  describe("/sprints/[sprintId]/tasks", () => {
    it("POST creates task (201)", async () => {
      asRole(m, "dev")
      m.createTask.mockResolvedValue({ id: "t1" })
      const res = await tasks.POST(jsonReq("POST", { pbItemId: "pb1", taskName: "Do", estimatedHours: 2 }), PS)
      expect(res.status).toBe(201)
      expect(m.createTask).toHaveBeenCalledWith("p1", "s1", { pbItemId: "pb1", taskName: "Do", estimatedHours: 2 }, actor)
    })

    it("POST 400 without pbItemId", async () => {
      asRole(m, "dev")
      expect((await tasks.POST(jsonReq("POST", { taskName: "Do" }), PS)).status).toBe(400)
    })

    it("POST 404 for non-member", async () => {
      asRole(m, "outsider")
      expect((await tasks.POST(jsonReq("POST", { pbItemId: "pb1" }), PS)).status).toBe(404)
    })

    it("POST maps ValidationError to 400 with message", async () => {
      asRole(m, "dev")
      m.createTask.mockRejectedValue(new ValidationError("PBI not in sprint"))
      const res = await tasks.POST(jsonReq("POST", { pbItemId: "pb1" }), PS)
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: "PBI not in sprint", code: "VALIDATION" })
    })

    it("PATCH updates task", async () => {
      asRole(m, "dev")
      m.updateTask.mockResolvedValue({ id: "t1", status: "done" })
      const res = await task.PATCH(jsonReq("PATCH", { status: "done", actualHours: 3 }), PST)
      expect(res.status).toBe(200)
      expect(m.updateTask).toHaveBeenCalledWith("p1", "s1", "t1", { status: "done", actualHours: 3 }, actor)
    })

    it("PATCH 400 on bad status", async () => {
      asRole(m, "dev")
      expect((await task.PATCH(jsonReq("PATCH", { status: "blocked" }), PST)).status).toBe(400)
    })

    it("PATCH 401 without session", async () => {
      asRole(m, "none")
      expect((await task.PATCH(jsonReq("PATCH", { status: "done" }), PST)).status).toBe(401)
    })

    it("DELETE task", async () => {
      asRole(m, "dev")
      const res = await task.DELETE(getReq(), PST)
      expect(res.status).toBe(200)
      expect(m.deleteTask).toHaveBeenCalledWith("p1", "s1", "t1", expect.objectContaining({ userId: expect.any(String) }), undefined)
    })

    it("DELETE task forwards ?version= and returns 409 VERSION_CONFLICT with current", async () => {
      asRole(m, "dev")
      const { VersionConflictError } = await import("@/services/_shared")
      m.deleteTask.mockRejectedValueOnce(new VersionConflictError({ id: "t1", version: 3 }))
      const res = await task.DELETE(getReq("http://localhost/api/x?version=2"), PST)
      expect(res.status).toBe(409)
      expect(await res.json()).toMatchObject({ code: "VERSION_CONFLICT", current: { id: "t1", version: 3 } })
      expect(m.deleteTask).toHaveBeenCalledWith("p1", "s1", "t1", expect.anything(), 2)
    })

    it("PATCH task accepts assigneeIds and version", async () => {
      asRole(m, "dev")
      m.updateTask.mockResolvedValueOnce({ id: "t1" })
      const res = await task.PATCH(jsonReq("PATCH", { assigneeIds: ["u1"], version: 1 }), PST)
      expect(res.status).toBe(200)
      expect(m.updateTask).toHaveBeenCalledWith("p1", "s1", "t1", { assigneeIds: ["u1"], version: 1 }, expect.anything())
    })

    it("DELETE 500 on failure", async () => {
      asRole(m, "dev")
      m.deleteTask.mockRejectedValue(new Error("x"))
      expect((await task.DELETE(getReq(), PST)).status).toBe(500)
    })

    it("DELETE 404 for non-member", async () => {
      asRole(m, "outsider")
      expect((await task.DELETE(getReq(), PST)).status).toBe(404)
    })
  })
})
