import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/db", () => ({ defaultDb: {}, withTransaction: vi.fn() }))
vi.mock("@/services/_shared/notifications", () => ({ notify: vi.fn(async () => 1) }))

const { notify } = await import("@/services/_shared/notifications")
const { fakeDb } = await import("@/services/__tests__/fake-db")
const job = await import("../jobs/improvement-checks")

// Local time: 2026-10-02 07:45 (collab-daily)
const NOW = new Date(2026, 9, 2, 7, 45)

const due = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  dueDate: new Date("2026-10-01T00:00:00.000Z"),
  kind: "1m",
  releaseItem: { id: "r1", projectId: "p1", initiative: null, userStory: "段取り短縮\n詳細", pbItem: null },
  ...over,
})

describe("runImprovementCheckReminders", () => {
  beforeEach(() => vi.mocked(notify).mockClear())

  it("queries only unchecked, unnotified checks due by today in live process_improvement projects", async () => {
    const db = fakeDb({ "improvementCheck.findMany": [] })
    await job.runImprovementCheckReminders({ db: db.client, now: () => NOW })
    const args = db.fn("improvementCheck.findMany").mock.calls[0][0]
    expect(args.where).toMatchObject({
      checkedAt: null,
      notifiedAt: null,
      dueDate: { lt: new Date("2026-10-03T00:00:00.000Z") },
      releaseItem: { kaizenStage: { not: "deferred" }, project: { status: "active", deletedAt: null, projectType: "process_improvement" } },
    })
  })

  it("notifies the project's POs once per check and stamps notifiedAt", async () => {
    const db = fakeDb({
      "improvementCheck.findMany": [due(), due({ id: "c2", kind: "3m" })],
      "projectMember.findMany": [{ userId: "po1" }, { userId: "po2" }],
      "improvementCheck.updateMany": { count: 1 },
    })
    const out = await job.runImprovementCheckReminders({ db: db.client, now: () => NOW })
    expect(out).toEqual({ status: "done", due: 2, notified: 2, stamped: 2 })
    // (the fake client is a Proxy: compare the input, not the client)
    expect(vi.mocked(notify).mock.calls[0][1]).toEqual({
      recipientIds: ["po1", "po2"],
      type: "improvement_check_due",
      projectId: "p1",
      entityType: "release",
      entityId: "r1",
      payload: { entityLabel: "段取り短縮", dueDate: "2026-10-01", kind: "1m", checkId: "c1" },
      dedupeKey: "improvement_check_due:c1:2026-10-01",
    })
    // PO lookup memoised per project.
    expect(db.fn("projectMember.findMany")).toHaveBeenCalledTimes(1)
    expect(db.fn("projectMember.findMany")).toHaveBeenCalledWith({ where: { projectId: "p1", role: "po" }, select: { userId: true } })
    expect(db.fn("improvementCheck.updateMany")).toHaveBeenCalledWith({ where: { id: "c1", notifiedAt: null }, data: { notifiedAt: NOW } })
  })

  it("is idempotent: a second run finds nothing (stamped rows are excluded) and notifies nobody", async () => {
    const db = fakeDb({ "improvementCheck.findMany": [] })
    const out = await job.runImprovementCheckReminders({ db: db.client, now: () => NOW })
    expect(out).toEqual({ status: "done", due: 0, notified: 0, stamped: 0 })
    expect(notify).not.toHaveBeenCalled()
  })

  it("a project without a PO is left unstamped (retried when a PO exists)", async () => {
    const db = fakeDb({ "improvementCheck.findMany": [due()], "projectMember.findMany": [] })
    const out = await job.runImprovementCheckReminders({ db: db.client, now: () => NOW })
    expect(out.stamped).toBe(0)
    expect(notify).not.toHaveBeenCalled()
    expect(db.fn("improvementCheck.updateMany")).not.toHaveBeenCalled()
  })

  it("uses the linked PBI's story as the label and honours an abort", async () => {
    const db = fakeDb({
      "improvementCheck.findMany": [due({ releaseItem: { id: "r1", projectId: "p1", initiative: "I", userStory: "own", pbItem: { userStory: "from PBI" } } })],
      "projectMember.findMany": [{ userId: "po1" }],
      "improvementCheck.updateMany": { count: 1 },
    })
    await job.runImprovementCheckReminders({ db: db.client, now: () => NOW })
    expect(vi.mocked(notify).mock.calls[0][1].payload).toMatchObject({ entityLabel: "from PBI" })
    const ctrl = new AbortController()
    ctrl.abort()
    expect(await job.runImprovementCheckReminders({ db: db.client, now: () => NOW, signal: ctrl.signal })).toMatchObject({ status: "aborted" })
  })
})
