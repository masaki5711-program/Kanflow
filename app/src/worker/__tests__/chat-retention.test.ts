import { describe, expect, it, vi } from "vitest"
import type { Db } from "@/services/_shared/db"

vi.mock("@/services/_shared/db", () => ({ defaultDb: {} }))

const { purgeChatHistory } = await import("../jobs/chat-retention")

const NOW = new Date("2026-10-03T00:00:00.000Z")
const DAY = 86_400_000

function fakeDb(idsPerWhere: Record<string, string[]>) {
  const chatThread = {
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const key = Object.keys(where)[0]
      const ids = idsPerWhere[key] ?? []
      idsPerWhere[key] = []
      return ids.map((id) => ({ id }))
    }),
    deleteMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => ({ count: where.id.in.length })),
  }
  const aiJob = { deleteMany: vi.fn(async () => ({ count: 5 })) }
  return { db: { chatThread, aiJob } as unknown as Db, chatThread, aiJob }
}

describe("purgeChatHistory", () => {
  it("purges trashed threads, idle threads and finished jobs with their cutoffs", async () => {
    const { db, chatThread, aiJob } = fakeDb({ deletedAt: ["a", "b"], updatedAt: ["c"] })
    const out = await purgeChatHistory({ idleDays: 180, deletedDays: 30, aiJobDays: 30, now: () => NOW, db })
    expect(out).toEqual({
      chatIdle: { days: 180, deleted: 1 },
      chatDeleted: { days: 30, deleted: 2 },
      aiJobs: { days: 30, deleted: 5 },
    })
    expect(chatThread.findMany.mock.calls[0][0].where).toEqual({ deletedAt: { lt: new Date(NOW.getTime() - 30 * DAY) } })
    expect(chatThread.findMany.mock.calls[1][0].where).toEqual({ updatedAt: { lt: new Date(NOW.getTime() - 180 * DAY) } })
    expect(chatThread.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["a", "b"] } } })
    expect(aiJob.deleteMany).toHaveBeenCalledWith({
      where: { status: { in: ["done", "failed", "cancelled"] }, createdAt: { lt: new Date(NOW.getTime() - 30 * DAY) } },
    })
  })
})
