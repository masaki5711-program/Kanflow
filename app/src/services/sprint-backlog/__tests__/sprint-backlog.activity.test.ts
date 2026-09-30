import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/activity", async () => (await import("@/services/__tests__/support")).activityMock())
vi.mock("@/services/_shared/notifications", async () => (await import("@/services/__tests__/support")).notificationsMock())
vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/services/_shared/translations", async () => (await import("@/services/__tests__/support")).translationMock())
vi.mock("@/lib/pbi-status-sync", () => ({ syncPbiStatusFromTasks: vi.fn(async () => undefined) }))
vi.mock("@/lib/sprint-score", () => ({ recalcSprintActualScore: vi.fn(async () => 0) }))
vi.mock("../sprint-backlog.repository")

const repo = await import("../sprint-backlog.repository")
const act = await import("@/services/_shared/activity")
const nt = await import("@/services/_shared/notifications")
const { ACTOR, TX } = await import("@/services/__tests__/support")
const svc = await import("../sprint-backlog.service")

describe("sprint-backlog.service activity + notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(repo.findSprintId).mockResolvedValue({ id: "s1" })
    vi.mocked(repo.findProjectPbiId).mockResolvedValue({ id: "b1" })
    vi.mocked(repo.findTask).mockResolvedValue({ id: "t1", pbItemId: "b1" })
  })

  it("createTask logs create and notifies the resolved assignee", async () => {
    const task = { id: "t9", sprintId: "s1", pbItemId: "b1", taskName: "Build", assignee: "Bob" }
    vi.mocked(repo.insertTask).mockResolvedValue(task as never)
    vi.mocked(nt.resolveAssigneeUserIds).mockResolvedValueOnce(["u-bob"])
    await svc.createTask("p1", "s1", { pbItemId: "b1", taskName: "Build", assignee: "Bob" }, ACTOR)
    expect(act.logCreate).toHaveBeenCalledWith(TX, expect.objectContaining({ entityType: "sprint_task", entityId: "t9", actor: ACTOR, row: task }))
    expect(nt.resolveAssigneeUserIds).toHaveBeenCalledWith(TX, "p1", "Bob")
    expect(nt.notify).toHaveBeenCalledWith(TX, {
      recipientIds: ["u-bob"],
      actorId: "u1",
      type: "assigned",
      projectId: "p1",
      entityType: "sprint_task",
      entityId: "t9",
      payload: { entityLabel: "Build", sprintId: "s1", actorName: "Alice" },
    })
  })

  it("createTask without a resolvable assignee does not notify", async () => {
    vi.mocked(repo.insertTask).mockResolvedValue({ id: "t9", sprintId: "s1", taskName: "x", assignee: null } as never)
    await svc.createTask("p1", "s1", { pbItemId: "b1" }, ACTOR)
    expect(nt.notify).not.toHaveBeenCalled()
  })

  it("updateTask diffs the snapshot and notifies newly assigned users", async () => {
    vi.mocked(act.loadSnapshot).mockResolvedValueOnce({ id: "t1", assignee: "Ann", status: "todo" })
    const updated = { id: "t1", sprintId: "s1", pbItemId: "b1", taskName: "T", assignee: "Bob", status: "todo" }
    vi.mocked(repo.updateTask).mockResolvedValue(updated as never)
    vi.mocked(nt.newlyAssignedUserIds).mockResolvedValueOnce(["u-bob"])
    await svc.updateTask("p1", "s1", "t1", { assignee: "Bob" }, ACTOR)
    expect(act.loadSnapshot).toHaveBeenCalledWith(TX, "sprint_task", "t1")
    expect(act.logUpdate).toHaveBeenCalledWith(TX, expect.objectContaining({ entityId: "t1", after: updated, meta: { sprintId: "s1", pbItemId: "b1" } }))
    expect(nt.newlyAssignedUserIds).toHaveBeenCalledWith(TX, "p1", "Ann", "Bob")
    expect(nt.notify).toHaveBeenCalledWith(TX, expect.objectContaining({ type: "assigned", recipientIds: ["u-bob"], entityId: "t1" }))
  })

  it("updateTask without an assignee change does not notify", async () => {
    vi.mocked(act.loadSnapshot).mockResolvedValueOnce({ id: "t1", assignee: "Ann", status: "todo" })
    vi.mocked(repo.updateTask).mockResolvedValue({ id: "t1", pbItemId: "b1", assignee: "Ann", status: "done" } as never)
    await svc.updateTask("p1", "s1", "t1", { status: "done" }, ACTOR)
    expect(nt.newlyAssignedUserIds).not.toHaveBeenCalled()
    expect(nt.notify).not.toHaveBeenCalled()
  })

  it("deleteTask logs the snapshot as deleted", async () => {
    vi.mocked(act.loadSnapshot).mockResolvedValueOnce({ id: "t1", taskName: "T" })
    await svc.deleteTask("p1", "s1", "t1", ACTOR)
    expect(act.logDelete).toHaveBeenCalledWith(TX, expect.objectContaining({ entityId: "t1", row: { id: "t1", taskName: "T" }, actor: ACTOR }))
  })

  it("add / remove PBIs log one move per PBI", async () => {
    vi.mocked(repo.findSprintPbiIds).mockResolvedValue({ id: "s1", items: [] })
    vi.mocked(repo.findProjectPbiIds).mockResolvedValue([{ id: "b1" }, { id: "b2" }])
    vi.mocked(repo.findPlaceholders).mockResolvedValue([] as never)
    await svc.addPbisToSprint("p1", "s1", ["b1", "b2"], ACTOR)
    expect(act.logActivity).toHaveBeenCalledTimes(2)
    expect(act.logActivity).toHaveBeenCalledWith(TX, expect.objectContaining({
      entityType: "pbi",
      entityId: "b2",
      action: "move",
      diff: { changes: { sprintId: { from: null, to: "s1" } } },
    }))

    vi.mocked(act.logActivity).mockClear()
    vi.mocked(repo.findSprintRowsOfPbi).mockResolvedValue([])
    vi.mocked(repo.deleteSprintRowsOfPbi).mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 })
    await svc.removePbiFromSprint("p1", "s1", "b1", ACTOR)
    expect(act.logActivity).not.toHaveBeenCalled()
    await svc.removePbiFromSprint("p1", "s1", "b1", ACTOR)
    expect(act.logActivity).toHaveBeenCalledWith(TX, expect.objectContaining({ diff: { changes: { sprintId: { from: "s1", to: null } } } }))
  })
})
