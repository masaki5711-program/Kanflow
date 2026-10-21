import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/activity", async () => (await import("@/services/__tests__/support")).activityMock())
vi.mock("@/services/_shared/notifications", async () => (await import("@/services/__tests__/support")).notificationsMock())
vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/services/_shared/translations", async () => (await import("@/services/__tests__/support")).translationMock())
vi.mock("@/lib/pbi-status-sync", () => ({ syncPbiStatusFromTasks: vi.fn(async () => undefined) }))
vi.mock("@/lib/sprint-score", () => ({ recalcSprintActualScore: vi.fn(async () => 0) }))
vi.mock("../sprint-completion-review", () => ({ launchSprintCompletionReview: vi.fn() }))
vi.mock("../sprints.repository")

const repo = await import("../sprints.repository")
const act = await import("@/services/_shared/activity")
const nt = await import("@/services/_shared/notifications")
const { ACTOR, TX } = await import("@/services/__tests__/support")
const svc = await import("../sprints.service")

const START = new Date("2026-10-01T00:00:00.000Z")
const END = new Date("2026-10-14T00:00:00.000Z")
const sprintRow = (status: string) => ({ id: "s1", sprintName: "S1", startDate: START, endDate: END, status })

describe("sprintLifecycleNotification", () => {
  it("maps status transitions", () => {
    expect(svc.sprintLifecycleNotification({ status: { from: "planning", to: "active" } })).toBe("sprint_start")
    expect(svc.sprintLifecycleNotification({ status: { from: "active", to: "archived" } })).toBe("sprint_end")
    expect(svc.sprintLifecycleNotification({ status: { from: "review", to: "done" } })).toBe("sprint_end")
    expect(svc.sprintLifecycleNotification({ status: { from: "done", to: "archived" } })).toBeNull()
    expect(svc.sprintLifecycleNotification({ status: { from: "active", to: "review" } })).toBeNull()
    expect(svc.sprintLifecycleNotification({ status: { changed: true } })).toBeNull()
    expect(svc.sprintLifecycleNotification({})).toBeNull()
  })
})

describe("sprints.service activity + notifications", () => {
  beforeEach(() => vi.clearAllMocks())

  it("createSprint logs create", async () => {
    vi.mocked(repo.findOpenSprint).mockResolvedValue(null)
    vi.mocked(repo.insertSprint).mockResolvedValue(sprintRow("planning") as never)
    await svc.createSprint("p1", { sprintName: "S1", startDate: "2026-10-01", endDate: "2026-10-14" }, ACTOR)
    expect(act.logCreate).toHaveBeenCalledWith(TX, expect.objectContaining({ entityType: "sprint", entityId: "s1", meta: { pbCount: 0 } }))
  })

  it("activating a sprint notifies every member once (dedupeKey)", async () => {
    vi.mocked(act.loadSnapshot).mockResolvedValueOnce(sprintRow("planning"))
    vi.mocked(repo.updateSprint).mockResolvedValue(sprintRow("active") as never)
    vi.mocked(nt.projectMemberIds).mockResolvedValueOnce(["u1", "u2"])
    await svc.updateSprint("p1", "s1", { status: "active" }, ACTOR)
    expect(act.logUpdate).toHaveBeenCalledWith(TX, expect.objectContaining({ entityType: "sprint", entityId: "s1" }))
    expect(nt.projectMemberIds).toHaveBeenCalledWith(TX, "p1")
    expect(nt.notify).toHaveBeenCalledWith(TX, {
      recipientIds: ["u1", "u2"],
      actorId: "u1",
      type: "sprint_start",
      projectId: "p1",
      entityType: "sprint",
      entityId: "s1",
      payload: { sprintName: "S1", startDate: START.toISOString(), endDate: END.toISOString(), actorName: "Alice" },
      dedupeKey: "sprint_start:s1",
    })
  })

  it("completing a sprint (done → archived) sends sprint_end", async () => {
    vi.mocked(act.loadSnapshot).mockResolvedValueOnce(sprintRow("active"))
    vi.mocked(repo.updateSprint).mockResolvedValue(sprintRow("archived") as never)
    await svc.updateSprint("p1", "s1", { status: "done" }, ACTOR)
    expect(nt.notify).toHaveBeenCalledWith(TX, expect.objectContaining({ type: "sprint_end", dedupeKey: "sprint_end:s1" }))
  })

  it("other edits do not notify", async () => {
    vi.mocked(act.loadSnapshot).mockResolvedValueOnce(sprintRow("active"))
    vi.mocked(repo.updateSprint).mockResolvedValue({ ...sprintRow("active"), sprintName: "Renamed" } as never)
    await svc.updateSprint("p1", "s1", { sprintName: "Renamed" }, ACTOR)
    expect(nt.notify).not.toHaveBeenCalled()
  })

  it("deleteSprint logs the snapshot", async () => {
    vi.mocked(repo.findSprintChildren).mockResolvedValue({ tasks: [{ id: "t", pbItemId: "b" }], notes: [] } as never)
    vi.mocked(act.loadSnapshot).mockResolvedValueOnce(sprintRow("planning"))
    vi.mocked(repo.deleteSprint).mockResolvedValue(1)
    await svc.deleteSprint("p1", "s1", ACTOR)
    expect(act.logDelete).toHaveBeenCalledWith(TX, expect.objectContaining({ entityId: "s1", meta: { taskCount: 1 }, actor: ACTOR }))
  })
})
