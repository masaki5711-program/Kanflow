import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/activity", async () => (await import("@/services/__tests__/support")).activityMock())
vi.mock("@/services/_shared/notifications", async () => (await import("@/services/__tests__/support")).notificationsMock())
vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/services/_shared/translations", async () => (await import("@/services/__tests__/support")).translationMock())
vi.mock("@/lib/pbi-status-sync", () => ({ syncPbiStatusFromTasks: vi.fn(async () => undefined) }))
vi.mock("@/lib/sprint-score", () => ({ recalcSprintActualScore: vi.fn(async () => 0) }))
vi.mock("../sprint-backlog.repository")

const repo = await import("../sprint-backlog.repository")
const tr = await import("@/services/_shared/translations")
const { syncPbiStatusFromTasks } = await import("@/lib/pbi-status-sync")
const { recalcSprintActualScore } = await import("@/lib/sprint-score")
const { ACTOR, TX } = await import("@/services/__tests__/support")
const svc = await import("../sprint-backlog.service")

describe("sprint-backlog rules", () => {
  it("keeps a single assignee", () => {
    expect(svc.singleAssignee("A, B")).toBe("A")
    expect(svc.singleAssignee(" ,B")).toBeNull()
    expect(svc.singleAssignee(null)).toBeNull()
  })

  it("buildTaskUpdate stamps / clears completion", () => {
    expect(svc.buildTaskUpdate({ status: "done" }).completedAt).toBeInstanceOf(Date)
    expect(svc.buildTaskUpdate({ status: "todo" })).toEqual({ status: "todo", completedAt: null, completionComment: null })
    expect(svc.buildTaskUpdate({ status: "todo", completionComment: "keep" })).toEqual({
      status: "todo",
      completedAt: null,
      completionComment: "keep",
    })
    expect(svc.buildTaskUpdate({ assignee: "A,B" })).toEqual({ assignee: "A" })
  })
})

describe("sprint-backlog.service", () => {
  beforeEach(() => vi.clearAllMocks())

  it("adds only new project PBIs as placeholders and re-scores", async () => {
    vi.mocked(repo.findSprintPbiIds).mockResolvedValue({ id: "s1", items: [{ pbItemId: "b1" }] })
    vi.mocked(repo.findProjectPbiIds).mockResolvedValue([{ id: "b1" }, { id: "b2" }])
    vi.mocked(repo.findPlaceholders).mockResolvedValue([{ id: "t2" }] as never)
    const out = await svc.addPbisToSprint("p1", "s1", ["b1", "b2", "x"])
    expect(repo.insertPlaceholders).toHaveBeenCalledWith(TX, "s1", ["b2"])
    expect(recalcSprintActualScore).toHaveBeenCalledWith("s1", TX)
    expect(out).toEqual({ added: 1, skipped: 2, items: [{ id: "t2" }] })
  })

  it("add reports 0 when nothing is new, 404 for a foreign sprint", async () => {
    vi.mocked(repo.findSprintPbiIds).mockResolvedValueOnce({ id: "s1", items: [{ pbItemId: "b1" }] })
    vi.mocked(repo.findProjectPbiIds).mockResolvedValueOnce([{ id: "b1" }])
    expect(await svc.addPbisToSprint("p1", "s1", ["b1"])).toEqual({ added: 0, skipped: 1 })
    vi.mocked(repo.findSprintPbiIds).mockResolvedValueOnce(null)
    await expect(svc.addPbisToSprint("p1", "s1", ["b1"])).rejects.toThrow("Sprint not found")
  })

  it("remove deletes rows, purges their translations and re-syncs", async () => {
    vi.mocked(repo.findSprintId).mockResolvedValue({ id: "s1" })
    vi.mocked(repo.findSprintRowsOfPbi).mockResolvedValue([{ id: "t1" }, { id: "t2" }])
    vi.mocked(repo.deleteSprintRowsOfPbi).mockResolvedValue({ count: 2 })
    await expect(svc.removePbiFromSprint("p1", "s1", "b1")).resolves.toEqual({ removed: 2 })
    expect(tr.purgeIn).toHaveBeenCalledWith(TX, { sprint_task: ["t1", "t2"] })
    expect(syncPbiStatusFromTasks).toHaveBeenCalledWith("b1", TX)
  })

  it("create validates sprint and PBI, then scores, syncs and enqueues", async () => {
    vi.mocked(repo.findSprintId).mockResolvedValueOnce(null)
    await expect(svc.createTask("p1", "s1", { pbItemId: "b1" }, ACTOR)).rejects.toMatchObject({ status: 404 })
    vi.mocked(repo.findSprintId).mockResolvedValue({ id: "s1" })
    vi.mocked(repo.findProjectPbiId).mockResolvedValueOnce(null)
    await expect(svc.createTask("p1", "s1", { pbItemId: "b1" }, ACTOR)).rejects.toThrow("PBI not found")
    vi.mocked(repo.findProjectPbiId).mockResolvedValue({ id: "b1" })
    vi.mocked(repo.insertTask).mockResolvedValue({ id: "t9" } as never)
    await svc.createTask("p1", "s1", { pbItemId: "b1", taskName: "T", assignee: "A,B" }, ACTOR)
    expect(repo.insertTask).toHaveBeenCalledWith(TX, expect.objectContaining({ assignee: "A", status: "todo", estimatedHours: null }))
    expect(syncPbiStatusFromTasks).toHaveBeenCalledWith("b1", TX)
    expect(tr.enqueueIn).toHaveBeenCalledWith(TX, "sprint_task", "t9", { id: "t9" })
  })

  it("update enqueues task name and the effective completion comment", async () => {
    vi.mocked(repo.findTask).mockResolvedValue({ id: "t1", pbItemId: "b1" })
    vi.mocked(repo.updateTask).mockResolvedValue({ id: "t1", pbItemId: "b1" } as never)
    await svc.updateTask("p1", "s1", "t1", { status: "in_progress" }, ACTOR)
    expect(tr.enqueueIn).toHaveBeenCalledWith(TX, "sprint_task", "t1", { taskName: undefined, completionComment: null })
    expect(recalcSprintActualScore).toHaveBeenCalledWith("s1", TX)
  })

  it("update / delete 404 for unknown tasks", async () => {
    vi.mocked(repo.findTask).mockResolvedValue(null)
    await expect(svc.updateTask("p1", "s1", "t", {}, ACTOR)).rejects.toMatchObject({ status: 404 })
    await expect(svc.deleteTask("p1", "s1", "t")).rejects.toMatchObject({ status: 404 })
  })

  it("delete purges the task translation and re-syncs its PBI", async () => {
    vi.mocked(repo.findTask).mockResolvedValue({ id: "t1", pbItemId: "b1" })
    await svc.deleteTask("p1", "s1", "t1")
    expect(repo.deleteTask).toHaveBeenCalledWith(TX, "t1")
    expect(tr.purgeIn).toHaveBeenCalledWith(TX, { sprint_task: ["t1"] })
    expect(syncPbiStatusFromTasks).toHaveBeenCalledWith("b1", TX)
  })
})
