import { describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/db", () => ({ defaultDb: {}, withTransaction: vi.fn() }))

const { fakeDb } = await import("@/services/__tests__/fake-db")
const { purgeCollaborationHistory, cutoff, PURGE_BATCH } = await import("../jobs/activity-retention")

const NOW = new Date("2026-10-01T00:00:00.000Z")
const ids = (n: number, p = "a") => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}` }))

describe("purgeCollaborationHistory", () => {
  it("deletes old activity and old READ notifications in batches", async () => {
    const db = fakeDb()
    db.fn("activityLog.findMany").mockResolvedValueOnce(ids(PURGE_BATCH)).mockResolvedValueOnce(ids(3, "b"))
    db.fn("activityLog.deleteMany").mockImplementation(async (a: { where: { id: { in: string[] } } }) => ({ count: a.where.id.in.length }))
    db.fn("notification.findMany").mockResolvedValueOnce(ids(2, "n"))
    db.fn("notification.deleteMany").mockResolvedValue({ count: 2 })

    const out = await purgeCollaborationHistory({ db: db.client, now: () => NOW, activityDays: 730, notificationDays: 90 })

    expect(out).toEqual({ activity: { days: 730, deleted: PURGE_BATCH + 3 }, notifications: { days: 90, deleted: 2 } })
    expect(db.fn("activityLog.findMany")).toHaveBeenCalledWith({
      where: { createdAt: { lt: cutoff(NOW, 730) } },
      select: { id: true },
      take: PURGE_BATCH,
    })
    expect(db.fn("notification.findMany")).toHaveBeenCalledWith({
      where: { readAt: { not: null }, createdAt: { lt: cutoff(NOW, 90) } },
      select: { id: true },
      take: PURGE_BATCH,
    })
    expect(db.fn("notification.deleteMany")).toHaveBeenCalledWith({ where: { id: { in: ["n0", "n1"] } } })
  })

  it("does nothing when nothing is old", async () => {
    const db = fakeDb({ "activityLog.findMany": [], "notification.findMany": [] })
    const out = await purgeCollaborationHistory({ db: db.client, activityDays: 1, notificationDays: 1 })
    expect(out.activity.deleted + out.notifications.deleted).toBe(0)
    expect(db.fn("activityLog.deleteMany")).not.toHaveBeenCalled()
  })

  it("cutoff is days before now", () => {
    expect(cutoff(NOW, 1)).toEqual(new Date("2026-09-30T00:00:00.000Z"))
  })
})
