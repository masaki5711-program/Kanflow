import { describe, expect, it, vi } from "vitest"
import * as repo from "../ai-jobs.repository"
import type { Db } from "@/services/_shared/db"

function fakeDb(count = 1) {
  const aiJob = {
    updateMany: vi.fn(async () => ({ count })),
    findFirst: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
    deleteMany: vi.fn(async () => ({ count: 4 })),
  }
  return { db: { aiJob } as unknown as Db, aiJob }
}
const AT = new Date("2026-10-03T00:00:00.000Z")
const where = (m: { mock: { calls: unknown[][] } }, i = 0) => (m.mock.calls[i][0] as { where: unknown; data: unknown })

describe("ai-jobs repository transitions", () => {
  it("claim only a queued row and count the attempt", async () => {
    const { db, aiJob } = fakeDb()
    expect(await repo.markRunning(db, "j1", AT)).toBe(true)
    expect(where(aiJob.updateMany)).toEqual({
      where: { id: "j1", status: "queued" },
      data: { status: "running", startedAt: AT, progress: 0, attempts: { increment: 1 } },
    })
  })

  it("done / failed only from running, and free the dedupe key", async () => {
    const { db, aiJob } = fakeDb(0)
    expect(await repo.markDone(db, "j1", "r1", AT)).toBe(false)
    expect(where(aiJob.updateMany).where).toEqual({ id: "j1", status: "running" })
    expect(where(aiJob.updateMany).data).toMatchObject({ status: "done", activeKey: null, resultReportId: "r1", progress: 100 })
    await repo.markFailed(db, "j1", "boom", AT)
    expect(where(aiJob.updateMany, 1).data).toMatchObject({ status: "failed", activeKey: null, error: "boom" })
  })

  it("cancel only an active job", async () => {
    const { db, aiJob } = fakeDb()
    await repo.markCancelled(db, "j1", AT)
    expect(where(aiJob.updateMany)).toEqual({
      where: { id: "j1", status: { in: ["queued", "running"] } },
      data: { status: "cancelled", activeKey: null, finishedAt: AT },
    })
  })

  it("stale sweep requeues while attempts remain, then fails the rest", async () => {
    const { db, aiJob } = fakeDb(2)
    expect(await repo.sweepStale(db, AT, 2, AT, "interrupted")).toEqual({ requeued: 2, failed: 2 })
    expect(where(aiJob.updateMany, 0).where).toEqual({ status: "running", startedAt: { lt: AT }, attempts: { lt: 2 } })
    expect(where(aiJob.updateMany, 1)).toEqual({
      where: { status: "running", startedAt: { lt: AT } },
      data: { status: "failed", activeKey: null, finishedAt: AT, error: "interrupted" },
    })
  })

  it("retention deletes finished jobs only", async () => {
    const { db, aiJob } = fakeDb()
    expect(await repo.deleteFinishedBefore(db, AT)).toBe(4)
    expect(aiJob.deleteMany).toHaveBeenCalledWith({ where: { status: { in: ["done", "failed", "cancelled"] }, createdAt: { lt: AT } } })
  })
})
