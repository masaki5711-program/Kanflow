import { describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/db", () => ({ defaultDb: {}, withTransaction: vi.fn() }))

const { fakeDb } = await import("@/services/__tests__/fake-db")
const { PURGE_BATCH } = await import("../jobs/activity-retention")
const { purgeExpiredEstimateRuns } = await import("../jobs/plan-run-retention")

const NOW = new Date("2027-11-06T00:00:00.000Z")
const ids = (n: number, p = "r") => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}` }))

describe("purgeExpiredEstimateRuns", () => {
  it("deletes the runs past their own purgeAfter, in batches", async () => {
    const db = fakeDb()
    db.fn("planEstimateRun.findMany").mockResolvedValueOnce(ids(PURGE_BATCH)).mockResolvedValueOnce(ids(2, "s"))
    db.fn("planEstimateRun.deleteMany").mockImplementation(async (a: { where: { id: { in: string[] } } }) => ({ count: a.where.id.in.length }))

    const out = await purgeExpiredEstimateRuns({ db: db.client, now: () => NOW })

    expect(out).toEqual({ estimateRuns: { deleted: PURGE_BATCH + 2 } })
    expect(db.fn("planEstimateRun.findMany")).toHaveBeenCalledWith({ where: { purgeAfter: { lt: NOW } }, select: { id: true }, take: PURGE_BATCH })
    expect(db.fn("planEstimateRun.deleteMany")).toHaveBeenLastCalledWith({ where: { id: { in: ["s0", "s1"] } } })
  })

  it("deletes nothing when no run is past its deadline", async () => {
    const db = fakeDb({ "planEstimateRun.findMany": [] })
    const out = await purgeExpiredEstimateRuns({ db: db.client, now: () => NOW })
    expect(out.estimateRuns.deleted).toBe(0)
    expect(db.fn("planEstimateRun.deleteMany")).not.toHaveBeenCalled()
  })
})
