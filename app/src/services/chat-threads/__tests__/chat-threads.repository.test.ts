import { describe, expect, it, vi } from "vitest"
import * as repo from "../chat-threads.repository"
import { encodeCursor } from "@/services/_shared/cursor"
import type { Db } from "@/services/_shared/db"

function fakeDb() {
  const chatThread = { findMany: vi.fn(async () => []), findFirst: vi.fn(async () => null), update: vi.fn(async () => ({})), create: vi.fn(async () => ({})) }
  const chatMessage = { findMany: vi.fn(async () => [] as unknown[]), create: vi.fn(async () => ({})) }
  return { db: { chatThread, chatMessage } as unknown as Db, chatThread, chatMessage }
}
const OWNER = { projectId: "p1", userId: "u1" }

describe("chat-threads repository", () => {
  it("lists only the owner's live threads of the project, newest activity first", async () => {
    const { db, chatThread } = fakeDb()
    await repo.findThreads(db, OWNER, undefined, 31)
    expect(chatThread.findMany).toHaveBeenCalledWith({
      where: { projectId: "p1", userId: "u1", deletedAt: null },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 31,
      select: { id: true, title: true, createdAt: true, updatedAt: true },
    })
  })

  it("applies the updatedAt keyset cursor", async () => {
    const { db, chatThread } = fakeDb()
    const at = new Date("2026-10-03T00:00:00.000Z")
    await repo.findThreads(db, OWNER, encodeCursor({ createdAt: at, id: "t5" }), 10)
    const where = (chatThread.findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where
    expect(where.OR).toEqual([{ updatedAt: { lt: at } }, { updatedAt: at, id: { lt: "t5" } }])
  })

  it("scopes a single-thread lookup by id + project + owner + not deleted", async () => {
    const { db, chatThread } = fakeDb()
    await repo.findOwnedThread(db, OWNER, "t1")
    expect(chatThread.findFirst).toHaveBeenCalledWith({
      where: { id: "t1", projectId: "p1", userId: "u1", deletedAt: null },
      select: { id: true, title: true, createdAt: true, updatedAt: true },
    })
  })

  it("returns the newest messages oldest-first", async () => {
    const { db, chatMessage } = fakeDb()
    chatMessage.findMany.mockResolvedValue([{ id: "m3" }, { id: "m2" }])
    expect(await repo.findLatestMessages(db, "t1", 2)).toEqual([{ id: "m2" }, { id: "m3" }])
    expect(chatMessage.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { threadId: "t1" }, take: 2 }))
  })
})

describe("proposal outcome storage", () => {
  it("finds the thread's assistant messages mentioning the proposal, oldest first", async () => {
    const { db, chatMessage } = fakeDb()
    await repo.findProposalMessages(db, "t1", "prop_1")
    expect(chatMessage.findMany).toHaveBeenCalledWith({
      where: { threadId: "t1", role: "assistant", toolEvents: { contains: "prop_1" } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, toolEvents: true },
    })
  })

  it("swaps the events only while the row still holds the expected JSON", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }))
    const db = { chatMessage: { updateMany } } as unknown as Db
    expect(await repo.swapToolEvents(db, "m1", "old", "new")).toBe(true)
    expect(updateMany).toHaveBeenCalledWith({ where: { id: "m1", toolEvents: "old" }, data: { toolEvents: "new" } })
    updateMany.mockResolvedValueOnce({ count: 0 })
    expect(await repo.swapToolEvents(db, "m1", "old", "new")).toBe(false)
  })
})
