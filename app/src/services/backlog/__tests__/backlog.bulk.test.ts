import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/services/_shared/translations", async () => (await import("@/services/__tests__/support")).translationMock())
vi.mock("@/services/_shared/activity", async () => (await import("@/services/__tests__/support")).activityMock())
vi.mock("@/services/_shared/notifications", async () => (await import("@/services/__tests__/support")).notificationsMock())
vi.mock("@/lib/sprint-score", () => ({ recalcSprintActualScore: vi.fn(async () => 0) }))
vi.mock("@/services/sprint-backlog/sprint-backlog.service", () => ({ addPbisToSprint: vi.fn() }))
vi.mock("../backlog.repository")

const repo = await import("../backlog.repository")
const activity = await import("@/services/_shared/activity")
const notifications = await import("@/services/_shared/notifications")
const sprintBacklog = await import("@/services/sprint-backlog/sprint-backlog.service")
const { recalcSprintActualScore } = await import("@/lib/sprint-score")
const { withTransaction } = await import("@/services/_shared/db")
const { ACTOR, TX } = await import("@/services/__tests__/support")
const { bulkBacklog } = await import("../backlog.bulk")

function row(id: string, over: Record<string, unknown> = {}) {
  return { id, displayId: Number(id.replace(/\D/g, "")) || 1, status: "not_ready", assignedPo: null, userStory: `Story ${id}`, ...over }
}

describe("bulkBacklog", () => {
  beforeEach(() => vi.clearAllMocks())

  describe("status", () => {
    it("updates only live PBIs whose status differs, in one transaction, logging each", async () => {
      // Arrange
      vi.mocked(repo.findLiveBacklogItemsByIds).mockResolvedValue([row("p1"), row("p2", { status: "ready" })] as never)
      vi.mocked(repo.updateBacklogItemsMany).mockResolvedValue(1)
      // Act
      const out = await bulkBacklog("proj", { action: "status", ids: ["p1", "p2", "gone", "p1"], payload: { status: "ready" } }, ACTOR)
      // Assert
      expect(withTransaction).toHaveBeenCalledTimes(1)
      expect(repo.findLiveBacklogItemsByIds).toHaveBeenCalledWith(TX, "proj", ["p1", "p2", "gone"])
      expect(repo.updateBacklogItemsMany).toHaveBeenCalledWith(TX, "proj", ["p1"], { status: "ready", completedAt: null })
      expect(out).toEqual({ action: "status", affectedIds: ["p1"], skippedIds: ["p2", "gone"] })
      expect(activity.logUpdate).toHaveBeenCalledTimes(1)
      expect(activity.logUpdate).toHaveBeenCalledWith(
        TX,
        expect.objectContaining({
          projectId: "proj",
          entityType: "pbi",
          entityId: "p1",
          actor: ACTOR,
          after: expect.objectContaining({ status: "ready" }),
          meta: { displayId: 1, bulk: true },
        })
      )
    })

    it("sets completedAt when completing", async () => {
      vi.mocked(repo.findLiveBacklogItemsByIds).mockResolvedValue([row("p1", { status: "ready" })] as never)
      await bulkBacklog("proj", { action: "status", ids: ["p1"], payload: { status: "completed" } }, ACTOR)
      expect(repo.updateBacklogItemsMany).toHaveBeenCalledWith(TX, "proj", ["p1"], { status: "completed", completedAt: expect.any(Date) })
    })

    it("does not write when nothing changes", async () => {
      vi.mocked(repo.findLiveBacklogItemsByIds).mockResolvedValue([row("p1", { status: "ready" })] as never)
      const out = await bulkBacklog("proj", { action: "status", ids: ["p1"], payload: { status: "ready" } }, ACTOR)
      expect(repo.updateBacklogItemsMany).not.toHaveBeenCalled()
      expect(out.affectedIds).toEqual([])
    })
  })

  describe("assignPo", () => {
    it("assigns the trimmed name and notifies newly assigned users per PBI", async () => {
      vi.mocked(repo.findLiveBacklogItemsByIds).mockResolvedValue([
        row("p1", { assignedPo: null }),
        row("p2", { assignedPo: "Bob" }),
        row("p3", { assignedPo: "Hanako" }),
      ] as never)
      vi.mocked(notifications.resolveAssigneeUserIds).mockImplementation(async (_db, _p, raw) =>
        raw === "Hanako" ? ["u-hanako"] : raw === "Bob" ? ["u-bob"] : []
      )
      const out = await bulkBacklog("proj", { action: "assignPo", ids: ["p1", "p2", "p3"], payload: { assignedPo: " Hanako " } }, ACTOR)
      expect(repo.updateBacklogItemsMany).toHaveBeenCalledWith(TX, "proj", ["p1", "p2"], { assignedPo: "Hanako" })
      expect(out).toEqual({ action: "assignPo", affectedIds: ["p1", "p2"], skippedIds: ["p3"] })
      expect(notifications.notify).toHaveBeenCalledTimes(2)
      expect(notifications.notify).toHaveBeenCalledWith(
        TX,
        expect.objectContaining({ recipientIds: ["u-hanako"], type: "assigned", entityType: "pbi", entityId: "p1", actorId: ACTOR.userId })
      )
      // The new name is resolved once, the previous names once each.
      expect(vi.mocked(notifications.resolveAssigneeUserIds).mock.calls.filter((c) => c[2] === "Hanako")).toHaveLength(1)
    })

    it("clears the PO with null (empty string counts as null) and notifies nobody", async () => {
      vi.mocked(repo.findLiveBacklogItemsByIds).mockResolvedValue([row("p1", { assignedPo: "Bob" })] as never)
      await bulkBacklog("proj", { action: "assignPo", ids: ["p1"], payload: { assignedPo: "  " } }, ACTOR)
      expect(repo.updateBacklogItemsMany).toHaveBeenCalledWith(TX, "proj", ["p1"], { assignedPo: null })
      expect(notifications.notify).not.toHaveBeenCalled()
    })
  })

  describe("trash", () => {
    it("soft-deletes live PBIs in one statement, re-scores their sprints and logs each", async () => {
      vi.mocked(repo.findLiveBacklogItemsByIds).mockResolvedValue([row("p1"), row("p2")] as never)
      vi.mocked(repo.softDeleteBacklogItemsMany).mockResolvedValue(2)
      vi.mocked(repo.findTasksOfBacklogItems).mockResolvedValue([
        { id: "t1", sprintId: "s1" },
        { id: "t2", sprintId: "s1" },
        { id: "t3", sprintId: "s2" },
      ])
      const out = await bulkBacklog("proj", { action: "trash", ids: ["p1", "p2", "x"] }, ACTOR)
      expect(repo.softDeleteBacklogItemsMany).toHaveBeenCalledWith(TX, "proj", ["p1", "p2"], ACTOR.userId)
      expect(repo.findTasksOfBacklogItems).toHaveBeenCalledWith(TX, ["p1", "p2"])
      expect(recalcSprintActualScore).toHaveBeenCalledTimes(2)
      expect(activity.logActivity).toHaveBeenCalledTimes(2)
      expect(activity.logActivity).toHaveBeenCalledWith(
        TX,
        expect.objectContaining({ entityId: "p2", action: "delete", diff: expect.objectContaining({ meta: { trashed: true, bulk: true } }) })
      )
      expect(out).toEqual({ action: "trash", affectedIds: ["p1", "p2"], skippedIds: ["x"] })
    })

    it("does nothing when no PBI is live", async () => {
      vi.mocked(repo.findLiveBacklogItemsByIds).mockResolvedValue([])
      const out = await bulkBacklog("proj", { action: "trash", ids: ["x"] }, ACTOR)
      expect(repo.softDeleteBacklogItemsMany).not.toHaveBeenCalled()
      expect(out).toEqual({ action: "trash", affectedIds: [], skippedIds: ["x"] })
    })
  })

  describe("addToSprint", () => {
    it("delegates to the sprint-backlog service (its own transaction) and reports the added PBIs", async () => {
      vi.mocked(sprintBacklog.addPbisToSprint).mockResolvedValue({
        added: 1,
        skipped: 1,
        items: [{ pbItemId: "p1" }],
      } as never)
      const out = await bulkBacklog("proj", { action: "addToSprint", ids: ["p1", "p2"], payload: { sprintId: "s1" } }, ACTOR)
      expect(sprintBacklog.addPbisToSprint).toHaveBeenCalledWith("proj", "s1", ["p1", "p2"], ACTOR)
      expect(out).toEqual({ action: "addToSprint", affectedIds: ["p1"], skippedIds: ["p2"] })
    })

    it("reports everything as skipped when nothing was added", async () => {
      vi.mocked(sprintBacklog.addPbisToSprint).mockResolvedValue({ added: 0, skipped: 2 } as never)
      const out = await bulkBacklog("proj", { action: "addToSprint", ids: ["p1", "p2"], payload: { sprintId: "s1" } }, ACTOR)
      expect(out).toEqual({ action: "addToSprint", affectedIds: [], skippedIds: ["p1", "p2"] })
    })
  })
})
