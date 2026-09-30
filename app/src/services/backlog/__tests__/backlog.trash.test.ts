import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/services/_shared/translations", async () => (await import("@/services/__tests__/support")).translationMock())
vi.mock("@/services/_shared/activity", async () => (await import("@/services/__tests__/support")).activityMock())
vi.mock("@/services/_shared/notifications", async () => (await import("@/services/__tests__/support")).notificationsMock())
vi.mock("@/services/_shared/soft-delete", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/_shared/soft-delete")>()),
  assertProjectLive: vi.fn(async () => undefined),
}))
vi.mock("@/lib/sprint-score", () => ({ recalcSprintActualScore: vi.fn(async () => 0) }))
vi.mock("../backlog.repository")

const repo = await import("../backlog.repository")
const tr = await import("@/services/_shared/translations")
const activity = await import("@/services/_shared/activity")
const softDelete = await import("@/services/_shared/soft-delete")
const { ConflictError } = await import("@/services/_shared/errors")
const { recalcSprintActualScore } = await import("@/lib/sprint-score")
const { ACTOR, TX } = await import("@/services/__tests__/support")
const svc = await import("../backlog.service")

const TASKS = [
  { id: "t1", sprintId: "s1" },
  { id: "t2", sprintId: "s1" },
  { id: "t3", sprintId: "s2" },
]

describe("backlog trash", () => {
  beforeEach(() => vi.clearAllMocks())

  it("delete moves the PBI to the trash, keeps translations and re-scores its sprints", async () => {
    vi.mocked(repo.softDeleteBacklogItem).mockResolvedValue(true)
    vi.mocked(repo.findTasksOfBacklogItem).mockResolvedValue(TASKS)
    await svc.deleteBacklogItem("p1", "a", ACTOR)
    expect(repo.softDeleteBacklogItem).toHaveBeenCalledWith(TX, "p1", "a", ACTOR.userId)
    expect(repo.deleteBacklogItem).not.toHaveBeenCalled()
    expect(tr.purgeIn).not.toHaveBeenCalled()
    expect(recalcSprintActualScore).toHaveBeenCalledTimes(2)
    expect(recalcSprintActualScore).toHaveBeenCalledWith("s2", TX)
    expect(activity.logActivity).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({ projectId: "p1", entityType: "pbi", entityId: "a", action: "delete", actor: ACTOR })
    )
  })

  it("delete 404s (PBI_NOT_FOUND) for a missing or already trashed PBI", async () => {
    vi.mocked(repo.softDeleteBacklogItem).mockResolvedValue(false)
    await expect(svc.deleteBacklogItem("p1", "a", ACTOR)).rejects.toMatchObject({ status: 404, code: "PBI_NOT_FOUND" })
    expect(recalcSprintActualScore).not.toHaveBeenCalled()
  })

  it("restore takes the PBI out of the trash and re-scores its sprints", async () => {
    vi.mocked(repo.findTrashedBacklogItem).mockResolvedValue({ id: "a", projectId: "p1" })
    vi.mocked(repo.restoreBacklogItemRow).mockResolvedValue(true)
    vi.mocked(repo.findTasksOfBacklogItem).mockResolvedValue(TASKS)
    await svc.restoreBacklogItem("p1", "a", ACTOR)
    expect(softDelete.assertProjectLive).toHaveBeenCalledWith(TX, "p1")
    expect(repo.restoreBacklogItemRow).toHaveBeenCalledWith(TX, "p1", "a")
    expect(recalcSprintActualScore).toHaveBeenCalledTimes(2)
    expect(activity.logActivity).toHaveBeenCalledWith(TX, expect.objectContaining({ action: "restore", entityId: "a" }))
  })

  it("restore 404s when the PBI is not in the trash", async () => {
    vi.mocked(repo.findTrashedBacklogItem).mockResolvedValue(null)
    await expect(svc.restoreBacklogItem("p1", "a", ACTOR)).rejects.toMatchObject({ status: 404, code: "PBI_NOT_FOUND" })
    expect(repo.restoreBacklogItemRow).not.toHaveBeenCalled()
  })

  it("restore fails with PROJECT_IN_TRASH when the project is trashed", async () => {
    vi.mocked(repo.findTrashedBacklogItem).mockResolvedValue({ id: "a", projectId: "p1" })
    vi.mocked(softDelete.assertProjectLive).mockRejectedValueOnce(new ConflictError("x", {}, "PROJECT_IN_TRASH"))
    await expect(svc.restoreBacklogItem("p1", "a", ACTOR)).rejects.toMatchObject({ status: 409, code: "PROJECT_IN_TRASH" })
    expect(repo.restoreBacklogItemRow).not.toHaveBeenCalled()
  })

  it("purge hard-deletes a trashed PBI with its task translations and re-scores sprints", async () => {
    vi.mocked(repo.findTrashedBacklogItem).mockResolvedValue({ id: "a", projectId: "p1" })
    vi.mocked(repo.findTasksOfBacklogItem).mockResolvedValue(TASKS)
    await svc.purgeBacklogItem("p1", "a", ACTOR)
    expect(repo.deleteBacklogItem).toHaveBeenCalledWith(TX, "p1", "a")
    expect(tr.purgeIn).toHaveBeenCalledWith(TX, { backlog_item: ["a"], sprint_task: ["t1", "t2", "t3"] })
    expect(recalcSprintActualScore).toHaveBeenCalledTimes(2)
  })

  it("purge refuses a PBI that is not in the trash (404)", async () => {
    vi.mocked(repo.findTrashedBacklogItem).mockResolvedValue(null)
    await expect(svc.purgeBacklogItem("p1", "a", null)).rejects.toMatchObject({ status: 404 })
    expect(repo.deleteBacklogItem).not.toHaveBeenCalled()
  })

  it("list hides a trashed linked Icebox request", async () => {
    vi.mocked(repo.findBacklogItems).mockResolvedValue([
      { id: "a", status: "ready", workloadScore: 1, iceboxItem: { id: "i1", deletedAt: new Date() }, productGoal: null },
      { id: "b", status: "ready", workloadScore: 1, iceboxItem: { id: "i2", deletedAt: null }, productGoal: null },
    ] as never)
    vi.mocked(tr.getI18nFor).mockResolvedValue(new Map() as never)
    const out = await svc.listBacklog("p1")
    expect(out.readyItems[0].iceboxItem).toBeNull()
    expect(out.readyItems[1].iceboxItem).toMatchObject({ id: "i2" })
  })
})
