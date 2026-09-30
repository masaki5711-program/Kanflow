import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/db", () => ({ defaultDb: {}, withTransaction: vi.fn() }))
vi.mock("@/services/_shared/notifications", () => ({ notify: vi.fn(async () => 1) }))

const { notify } = await import("@/services/_shared/notifications")
const { fakeDb } = await import("@/services/__tests__/fake-db")
const job = await import("../jobs/notify-due")

// Local time: 2026-10-01 07:00
const NOW = new Date(2026, 9, 1, 7, 0)
const day = (d: number) => new Date(2026, 9, d)

describe("due window helpers", () => {
  const w = job.dueWindow(NOW, 2)

  it("computes local-midnight bounds", () => {
    expect(w.today).toEqual(day(1))
    expect(w.soonEnd).toEqual(day(4))
    expect(w.overdueStart).toEqual(new Date(2026, 8, 17))
  })

  it("classifies due dates", () => {
    expect(job.classifyDue(day(1), w)).toBe("due_soon")
    expect(job.classifyDue(new Date(2026, 9, 3, 23, 59), w)).toBe("due_soon")
    expect(job.classifyDue(day(4), w)).toBeNull()
    expect(job.classifyDue(new Date(2026, 8, 30, 23, 0), w)).toBe("overdue")
    expect(job.classifyDue(new Date(2026, 8, 16), w)).toBeNull()
  })

  it("builds a per-day dedupe key", () => {
    expect(job.localDateKey(day(2))).toBe("2026-10-02")
    expect(job.dueDedupeKey("overdue", "t1", new Date(2026, 8, 30, 12))).toBe("overdue:t1:2026-09-30")
  })
})

describe("runNotifyDue", () => {
  beforeEach(() => vi.mocked(notify).mockClear())

  const task = (over: Record<string, unknown>) => ({
    id: "t1",
    taskName: "Build",
    assignee: null,
    assignees: [],
    sprint: { id: "s1", sprintName: "S1", endDate: day(2), projectId: "p1" },
    ...over,
  })

  it("notifies task assignees (normalized first, else legacy names) and plan PO/SM", async () => {
    const db = fakeDb({
      "sprintBacklogItem.findMany": [
        task({ id: "t1", assignees: [{ userId: "u-a" }] }),
        task({ id: "t2", assignee: "Hanako", sprint: { id: "s1", sprintName: "S1", endDate: new Date(2026, 8, 29), projectId: "p1" } }),
        task({ id: "t3", assignee: null }),
      ],
      "planItem.findMany": [{ id: "pl1", name: "Launch", plannedEnd: day(3), projectId: "p1" }],
    })
    db.fn("projectMember.findMany").mockImplementation(async (args: { where: { role?: unknown } }) =>
      args.where.role ? [{ userId: "u-po" }] : [{ userId: "u-h", user: { name: "Hanako" } }]
    )
    const out = await job.runNotifyDue({ db: db.client, now: () => NOW, soonDays: 2 })

    expect(out).toEqual({ status: "done", candidates: { tasks: 3, planItems: 1 }, notified: 4 })
    expect(notify).toHaveBeenCalledWith(expect.anything(), {
      recipientIds: ["u-a"],
      type: "due_soon",
      projectId: "p1",
      entityType: "sprint_task",
      entityId: "t1",
      payload: { entityLabel: "Build", dueDate: "2026-10-02", sprintId: "s1", sprintName: "S1" },
      dedupeKey: "due_soon:t1:2026-10-02",
    })
    expect(notify).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      recipientIds: ["u-h"],
      type: "overdue",
      entityId: "t2",
      dedupeKey: "overdue:t2:2026-09-29",
    }))
    expect(notify).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ recipientIds: [], entityId: "t3" }))
    expect(notify).toHaveBeenCalledWith(expect.anything(), {
      recipientIds: ["u-po"],
      type: "due_soon",
      projectId: "p1",
      entityType: "plan_item",
      entityId: "pl1",
      payload: { entityLabel: "Launch", dueDate: "2026-10-03" },
      dedupeKey: "due_soon:pl1:2026-10-03",
    })
    // Project lookups are memoized per run.
    expect(db.fn("projectMember.findMany")).toHaveBeenCalledTimes(2)
  })

  it("queries only live projects, active sprints and open items within the window", async () => {
    const db = fakeDb({ "sprintBacklogItem.findMany": [], "planItem.findMany": [] })
    await job.runNotifyDue({ db: db.client, now: () => NOW })
    const w = job.dueWindow(NOW, job.DEFAULT_NOTIFY_DUE_SOON_DAYS)
    const taskArgs = db.fn("sprintBacklogItem.findMany").mock.calls[0][0]
    expect(taskArgs.where).toEqual({
      status: { not: "done" },
      taskName: { not: null },
      pbItem: { deletedAt: null },
      sprint: {
        status: "active",
        endDate: { gte: w.overdueStart, lt: w.soonEnd },
        project: { status: "active", deletedAt: null },
      },
    })
    expect(db.fn("planItem.findMany").mock.calls[0][0].where).toEqual({
      status: { not: "done" },
      plannedEnd: { gte: w.overdueStart, lt: w.soonEnd },
      project: { status: "active", deletedAt: null },
    })
  })

  it("skips rows outside the window and stops when aborted", async () => {
    const db = fakeDb({
      "sprintBacklogItem.findMany": [task({ sprint: { id: "s", sprintName: "S", endDate: day(20), projectId: "p1" } })],
      "planItem.findMany": [{ id: "pl1", name: "x", plannedEnd: day(2), projectId: "p1" }],
    })
    db.fn("projectMember.findMany").mockResolvedValue([])
    expect((await job.runNotifyDue({ db: db.client, now: () => NOW })).notified).toBe(1)

    const ac = new AbortController()
    ac.abort()
    vi.mocked(notify).mockClear()
    expect((await job.runNotifyDue({ db: db.client, now: () => NOW, signal: ac.signal })).status).toBe("aborted")
    expect(notify).not.toHaveBeenCalled()
  })
})
