import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/activity", async () => (await import("@/services/__tests__/support")).activityMock())
vi.mock("@/services/_shared/notifications", async () => (await import("@/services/__tests__/support")).notificationsMock())
vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/services/_shared/translations", async () => (await import("@/services/__tests__/support")).translationMock())
vi.mock("@/lib/pbi-status-sync", () => ({ syncPbiStatusFromTasks: vi.fn(async () => undefined) }))
vi.mock("@/lib/plan-progress", () => ({ recalcPlanForPbis: vi.fn(async () => undefined) }))
vi.mock("@/lib/sprint-score", () => ({ recalcSprintActualScore: vi.fn(async () => 0) }))
vi.mock("../sprint-backlog.repository")

const repo = await import("../sprint-backlog.repository")
const act = await import("@/services/_shared/activity")
const nt = await import("@/services/_shared/notifications")
const tr = await import("@/services/_shared/translations")
const { ACTOR, TX, touchedTranslationFields } = await import("@/services/__tests__/support")
const svc = await import("../sprint-backlog.service")

const MEMBERS = [
  { id: "u-ann", name: "Ann" },
  { id: "u-bob", name: "Bob" },
]
const DETAIL = {
  id: "t1",
  sprintId: "s1",
  pbItemId: "b1",
  taskName: "T",
  assignee: "Bob",
  version: 4,
  assignees: [{ user: { id: "u-bob", name: "Bob" } }],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(repo.findSprintId).mockResolvedValue({ id: "s1" })
  vi.mocked(repo.findProjectPbiId).mockResolvedValue({ id: "b1" })
  vi.mocked(repo.findTask).mockResolvedValue({ id: "t1", pbItemId: "b1" })
  vi.mocked(repo.findProjectMemberCandidates).mockResolvedValue(MEMBERS)
  vi.mocked(repo.findTaskAssigneeIds).mockResolvedValue([])
  vi.mocked(repo.updateTask).mockResolvedValue(1)
  vi.mocked(repo.findTaskDetail).mockResolvedValue(DETAIL as never)
})

describe("task optimistic locking", () => {
  it("passes the version to the compare-and-set and returns the DTO with version and assignees", async () => {
    const out = await svc.updateTask("p1", "s1", "t1", { taskName: "T", version: 3 }, ACTOR)
    expect(repo.updateTask).toHaveBeenCalledWith(TX, "t1", { taskName: "T" }, 3)
    expect(out).toMatchObject({ id: "t1", version: 4, assignees: [{ id: "u-bob", name: "Bob" }] })
  })

  it("stale version → 409 with the current task DTO and no side effects", async () => {
    vi.mocked(repo.updateTask).mockResolvedValue(0)
    const err = await svc.updateTask("p1", "s1", "t1", { status: "done", version: 3 }, ACTOR).catch((e: unknown) => e)
    expect(err).toMatchObject({
      status: 409,
      code: "VERSION_CONFLICT",
      current: { id: "t1", version: 4, assignees: [{ id: "u-bob", name: "Bob" }], i18n: {} },
    })
    expect(tr.enqueueIn).not.toHaveBeenCalled()
    expect(repo.replaceTaskAssignees).not.toHaveBeenCalled()
  })

  it("task gone between the check and the write → 404", async () => {
    vi.mocked(repo.updateTask).mockResolvedValue(0)
    vi.mocked(repo.findTaskDetail).mockResolvedValue(null)
    await expect(svc.updateTask("p1", "s1", "t1", { status: "done", version: 3 }, ACTOR)).rejects.toMatchObject({ status: 404 })
  })

  it("without a version: plain (still version-bumping) update", async () => {
    await svc.updateTask("p1", "s1", "t1", { status: "in_progress" }, ACTOR)
    expect(repo.updateTask).toHaveBeenCalledWith(TX, "t1", expect.objectContaining({ status: "in_progress" }), undefined)
  })

  it("delete with a stale version → 409", async () => {
    vi.mocked(repo.deleteTask).mockResolvedValue(0)
    await expect(svc.deleteTask("p1", "s1", "t1", ACTOR, 3)).rejects.toMatchObject({ status: 409, code: "VERSION_CONFLICT" })
    expect(repo.deleteTask).toHaveBeenCalledWith(TX, "t1", 3)
    expect(tr.purgeIn).not.toHaveBeenCalled()
  })
})

describe("task assignee dual-write", () => {
  it("create with assigneeIds writes TaskAssignee rows, the legacy names and notifies by id", async () => {
    vi.mocked(repo.insertTask).mockResolvedValue({ id: "t9", sprintId: "s1", pbItemId: "b1", taskName: "Build" } as never)
    const out = await svc.createTask("p1", "s1", { pbItemId: "b1", taskName: "Build", assigneeIds: ["u-bob", "u-ann"] }, ACTOR)
    expect(repo.insertTask).toHaveBeenCalledWith(TX, expect.objectContaining({ assignee: "Bob, Ann" }))
    expect(repo.insertTask).toHaveBeenCalledWith(TX, expect.not.objectContaining({ assigneeIds: expect.anything() }))
    expect(repo.replaceTaskAssignees).toHaveBeenCalledWith(TX, "t9", ["u-bob", "u-ann"])
    expect(nt.notify).toHaveBeenCalledWith(TX, expect.objectContaining({ type: "assigned", recipientIds: ["u-bob", "u-ann"], entityId: "t9" }))
    expect(nt.resolveAssigneeUserIds).not.toHaveBeenCalled()
    expect(out.assignees).toEqual([
      { id: "u-bob", name: "Bob" },
      { id: "u-ann", name: "Ann" },
    ])
  })

  it("create with a legacy string syncs the matched member", async () => {
    vi.mocked(repo.insertTask).mockResolvedValue({ id: "t9", sprintId: "s1", pbItemId: "b1", taskName: "x" } as never)
    await svc.createTask("p1", "s1", { pbItemId: "b1", assignee: "bob" }, ACTOR)
    expect(repo.insertTask).toHaveBeenCalledWith(TX, expect.objectContaining({ assignee: "bob" }))
    expect(repo.replaceTaskAssignees).toHaveBeenCalledWith(TX, "t9", ["u-bob"])
  })

  it("create rejects a non-member id with 400 before inserting", async () => {
    await expect(svc.createTask("p1", "s1", { pbItemId: "b1", assigneeIds: ["u-x"] }, ACTOR)).rejects.toMatchObject({ status: 400 })
    expect(repo.insertTask).not.toHaveBeenCalled()
  })

  it("create without assignee fields skips the member lookup and writes no rows", async () => {
    vi.mocked(repo.insertTask).mockResolvedValue({ id: "t9", sprintId: "s1", pbItemId: "b1" } as never)
    const out = await svc.createTask("p1", "s1", { pbItemId: "b1" }, ACTOR)
    expect(repo.findProjectMemberCandidates).not.toHaveBeenCalled()
    expect(repo.replaceTaskAssignees).not.toHaveBeenCalled()
    expect(repo.insertTask).toHaveBeenCalledWith(TX, expect.objectContaining({ assignee: null }))
    expect(out.assignees).toEqual([])
  })

  it("update with assigneeIds replaces the set, writes the legacy names and notifies only newcomers", async () => {
    vi.mocked(repo.findTaskAssigneeIds).mockResolvedValue(["u-ann"])
    await svc.updateTask("p1", "s1", "t1", { assigneeIds: ["u-ann", "u-bob"], version: 3 }, ACTOR)
    expect(repo.updateTask).toHaveBeenCalledWith(TX, "t1", { assignee: "Ann, Bob" }, 3)
    expect(repo.replaceTaskAssignees).toHaveBeenCalledWith(TX, "t1", ["u-ann", "u-bob"])
    expect(nt.notify).toHaveBeenCalledWith(TX, expect.objectContaining({ recipientIds: ["u-bob"] }))
  })

  it("update of a not-yet-backfilled task uses the legacy string as the previous assignees", async () => {
    vi.mocked(act.loadSnapshot).mockResolvedValueOnce({ id: "t1", assignee: "Bob" })
    await svc.updateTask("p1", "s1", "t1", { assigneeIds: ["u-bob"] }, ACTOR)
    expect(nt.notify).not.toHaveBeenCalled()
  })

  it("update with only the legacy string resolves and syncs members (single owner kept)", async () => {
    await svc.updateTask("p1", "s1", "t1", { assignee: "Ann, Bob" }, ACTOR)
    expect(repo.updateTask).toHaveBeenCalledWith(TX, "t1", { assignee: "Ann" }, undefined)
    expect(repo.replaceTaskAssignees).toHaveBeenCalledWith(TX, "t1", ["u-ann"])
  })

  it("update with assigneeIds [] clears both", async () => {
    await svc.updateTask("p1", "s1", "t1", { assigneeIds: [] }, ACTOR)
    expect(repo.updateTask).toHaveBeenCalledWith(TX, "t1", { assignee: null }, undefined)
    expect(repo.replaceTaskAssignees).toHaveBeenCalledWith(TX, "t1", [])
  })

  it("update without assignee fields leaves TaskAssignee alone", async () => {
    await svc.updateTask("p1", "s1", "t1", { status: "done" }, ACTOR)
    expect(repo.findProjectMemberCandidates).not.toHaveBeenCalled()
    expect(repo.replaceTaskAssignees).not.toHaveBeenCalled()
    expect(nt.notify).not.toHaveBeenCalled()
  })
})

describe("A3-02: a task status move keeps the task-name translation", () => {
  it("moving to done touches no FieldTranslation row", async () => {
    await svc.updateTask("p1", "s1", "t1", { status: "done" }, ACTOR)
    expect(tr.enqueueIn).toHaveBeenCalledTimes(1)
    expect(touchedTranslationFields(tr.enqueueIn)).toEqual([])
  })

  it("moving back to in_progress only clears the (removed) completion comment, never the task name", async () => {
    await svc.updateTask("p1", "s1", "t1", { status: "in_progress", version: 3 }, ACTOR)
    expect(touchedTranslationFields(tr.enqueueIn)).toEqual(["completionComment"])
  })

  it("renaming still enqueues the task name", async () => {
    await svc.updateTask("p1", "s1", "t1", { taskName: "New" }, ACTOR)
    expect(touchedTranslationFields(tr.enqueueIn)).toEqual(["taskName"])
  })
})
