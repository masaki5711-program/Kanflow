import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/activity", async () => (await import("@/services/__tests__/support")).activityMock())
vi.mock("@/services/_shared/notifications", async () => (await import("@/services/__tests__/support")).notificationsMock())
vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/services/_shared/translations", async () => (await import("@/services/__tests__/support")).translationMock())
vi.mock("@/lib/sprint-score", () => ({ recalcSprintActualScore: vi.fn(async () => 0) }))
vi.mock("../backlog.repository")

const repo = await import("../backlog.repository")
const act = await import("@/services/_shared/activity")
const nt = await import("@/services/_shared/notifications")
const { ACTOR, TX } = await import("@/services/__tests__/support")
const svc = await import("../backlog.service")

describe("backlog.service activity + notifications", () => {
  beforeEach(() => vi.clearAllMocks())

  it("create logs and notifies the assigned PO", async () => {
    vi.mocked(repo.nextBacklogNumbers).mockResolvedValue({ displayId: 7, sortOrder: 1 })
    const item = { id: "b1", displayId: 7, userStory: "Story", assignedPo: "Ann" }
    vi.mocked(repo.insertBacklogItem).mockResolvedValue(item as never)
    vi.mocked(nt.newlyAssignedUserIds).mockResolvedValueOnce(["u-ann"])
    await svc.createBacklogItem("p1", { userStory: "Story", assignedPo: "Ann" }, ACTOR)
    expect(act.logCreate).toHaveBeenCalledWith(TX, expect.objectContaining({ entityType: "pbi", entityId: "b1", meta: { displayId: 7 } }))
    expect(nt.newlyAssignedUserIds).toHaveBeenCalledWith(TX, "p1", null, "Ann")
    expect(nt.notify).toHaveBeenCalledWith(TX, {
      recipientIds: ["u-ann"],
      actorId: "u1",
      type: "assigned",
      projectId: "p1",
      entityType: "pbi",
      entityId: "b1",
      payload: { entityLabel: "#7 Story", displayId: 7, actorName: "Alice" },
    })
  })

  it("update notifies only on an assignedPo change", async () => {
    vi.mocked(act.loadSnapshot).mockResolvedValueOnce({ id: "b1", assignedPo: "Ann", status: "ready" })
    vi.mocked(repo.updateBacklogItem).mockResolvedValueOnce({ id: "b1", displayId: 7, assignedPo: "Bob", status: "ready" } as never)
    vi.mocked(nt.newlyAssignedUserIds).mockResolvedValueOnce(["u-bob"])
    await svc.updateBacklogItem("p1", "b1", { assignedPo: "Bob" }, ACTOR)
    expect(act.logUpdate).toHaveBeenCalledWith(TX, expect.objectContaining({ entityType: "pbi", entityId: "b1", meta: { displayId: 7 } }))
    expect(nt.newlyAssignedUserIds).toHaveBeenCalledWith(TX, "p1", "Ann", "Bob")
    expect(nt.notify).toHaveBeenCalledTimes(1)

    vi.mocked(act.loadSnapshot).mockResolvedValueOnce({ id: "b1", assignedPo: "Bob", status: "ready" })
    vi.mocked(repo.updateBacklogItem).mockResolvedValueOnce({ id: "b1", displayId: 7, assignedPo: "Bob", status: "completed" } as never)
    await svc.updateBacklogItem("p1", "b1", { status: "completed" }, ACTOR)
    expect(nt.notify).toHaveBeenCalledTimes(1)
  })

  it("setting the confidential flag (D-5) is written and logged like any other PBI field change, without notifying", async () => {
    vi.mocked(act.loadSnapshot).mockResolvedValueOnce({ id: "b1", assignedPo: "Ann", confidential: false })
    vi.mocked(repo.updateBacklogItem).mockResolvedValueOnce({ id: "b1", displayId: 7, assignedPo: "Ann", confidential: true } as never)
    await svc.updateBacklogItem("p1", "b1", { confidential: true }, ACTOR)
    expect(vi.mocked(repo.updateBacklogItem).mock.calls[0]?.[3]).toMatchObject({ confidential: true })
    expect(act.logUpdate).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({ entityType: "pbi", entityId: "b1", actor: ACTOR, before: { id: "b1", assignedPo: "Ann", confidential: false }, after: expect.objectContaining({ confidential: true }) })
    )
    expect(nt.notify).not.toHaveBeenCalled()
  })

  it("reorder logs one project-level move", async () => {
    await svc.reorderBacklog("p1", ["a", "b"], ACTOR)
    expect(act.logActivity).toHaveBeenCalledTimes(1)
    expect(act.logActivity).toHaveBeenCalledWith(TX, {
      projectId: "p1",
      entityType: "project",
      entityId: "p1",
      action: "move",
      actor: ACTOR,
      diff: { changes: { backlogOrder: { changed: true } }, meta: { count: 2 } },
    })
  })
})

describe("pbiNotificationLabel (F-06)", () => {
  it("names a PBI '#displayId title' with the initiative first, else the user story's first line", () => {
    expect(svc.pbiNotificationLabel({ displayId: 7, initiative: "Login", userStory: "As a user" })).toBe("#7 Login")
    expect(svc.pbiNotificationLabel({ displayId: 7, initiative: " ", userStory: "As a user\nI want" })).toBe("#7 As a user")
    expect(svc.pbiNotificationLabel({ displayId: 7, initiative: null, userStory: null })).toBe("#7")
  })
})
