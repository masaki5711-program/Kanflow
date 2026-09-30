import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("../chat-threads.repository")
vi.mock("@/lib/logger", () => {
  const noop = { debug() {}, info() {}, warn: vi.fn(), error() {}, child: () => noop }
  return { logger: noop }
})

const repo = await import("../chat-threads.repository")
const svc = await import("../chat-threads.service")
const { DEFAULT_DB, TX } = await import("@/services/__tests__/support")
const { NotFoundError } = await import("@/services/_shared/errors")
const { decodeCursor } = await import("@/services/_shared/cursor")
const { encodeChatEvent, decodeChatStream } = await import("@/lib/chat-proposals")
type ChatProposal = import("@/lib/chat-proposals").ChatProposal

const OWNER = { projectId: "p1", userId: "u1" }
const T0 = new Date("2026-10-03T01:00:00.000Z")
const T1 = new Date("2026-10-03T02:00:00.000Z")
const thread = (id: string, updatedAt = T1) => ({ id, title: `Title ${id}`, createdAt: T0, updatedAt })

const PROPOSAL: ChatProposal = {
  kind: "create_pbi",
  proposalId: "prop-1",
  title: "Login",
  userStory: "As a user",
  acceptanceCriteria: "- works",
  storyPoints: 3,
  epic: null,
  reason: "requested",
  possibleDuplicates: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(repo.findOwnedThread).mockResolvedValue(thread("t1"))
  vi.mocked(repo.createThread).mockResolvedValue(thread("new"))
  vi.mocked(repo.insertMessage).mockResolvedValue({ id: "m1" } as never)
  vi.mocked(repo.touchThread).mockResolvedValue({ id: "t1" } as never)
})

describe("deriveThreadTitle", () => {
  it("collapses whitespace and cuts to 60 characters (code points)", () => {
    expect(svc.deriveThreadTitle("  hello \n  world ")).toBe("hello world")
    const long = "進".repeat(70)
    expect(svc.deriveThreadTitle(long)).toBe(`${"進".repeat(60)}…`)
    expect(svc.deriveThreadTitle("   ")).toBe("Chat")
  })
})

describe("thread CRUD is owner-scoped", () => {
  it("lists newest-active first with an updatedAt cursor", async () => {
    vi.mocked(repo.findThreads).mockResolvedValue([thread("a"), thread("b", T0), thread("c", T0)])
    const page = await svc.listThreads(OWNER, { limit: 2 })
    expect(repo.findThreads).toHaveBeenCalledWith(DEFAULT_DB, OWNER, undefined, 3)
    expect(page.items.map((t) => t.id)).toEqual(["a", "b"])
    expect(page.items[0]).toEqual({ id: "a", title: "Title a", createdAt: T0.toISOString(), updatedAt: T1.toISOString() })
    expect(decodeCursor(page.nextCursor!)).toEqual({ createdAt: T0, id: "b" })
  })

  it("returns no cursor on the last page", async () => {
    vi.mocked(repo.findThreads).mockResolvedValue([thread("a")])
    expect((await svc.listThreads(OWNER, { limit: 2, cursor: "x" })).nextCursor).toBeNull()
    expect(repo.findThreads).toHaveBeenCalledWith(DEFAULT_DB, OWNER, "x", 3)
  })

  it("get / rename / delete are 404 for a thread that is not the caller's", async () => {
    vi.mocked(repo.findOwnedThread).mockResolvedValue(null)
    await expect(svc.getThread(OWNER, "t9")).rejects.toBeInstanceOf(NotFoundError)
    await expect(svc.renameThread(OWNER, "t9", "x")).rejects.toBeInstanceOf(NotFoundError)
    await expect(svc.deleteThread(OWNER, "t9")).rejects.toBeInstanceOf(NotFoundError)
    expect(repo.findOwnedThread).toHaveBeenCalledWith(DEFAULT_DB, OWNER, "t9")
    expect(repo.updateThreadTitle).not.toHaveBeenCalled()
    expect(repo.softDeleteThread).not.toHaveBeenCalled()
  })

  it("renames and soft-deletes the owned thread", async () => {
    vi.mocked(repo.updateThreadTitle).mockResolvedValue({ ...thread("t1"), title: "New" })
    expect((await svc.renameThread(OWNER, "t1", "New")).title).toBe("New")
    expect(repo.updateThreadTitle).toHaveBeenCalledWith(DEFAULT_DB, "t1", "New")
    await svc.deleteThread(OWNER, "t1", T1)
    expect(repo.softDeleteThread).toHaveBeenCalledWith(DEFAULT_DB, "t1", T1)
  })

  it("returns messages with proposal frames re-encoded into the content", async () => {
    vi.mocked(repo.findLatestMessages).mockResolvedValue([
      { id: "m1", role: "user", content: "Q", toolEvents: null, partial: false, createdAt: T0 },
      {
        id: "m2",
        role: "assistant",
        content: "Answer",
        toolEvents: JSON.stringify([{ type: "tool", name: "get_sprint_metrics", ms: 12 }, { type: "proposal", proposal: PROPOSAL }, { type: "bogus" }]),
        partial: true,
        createdAt: T1,
      },
    ])
    const out = await svc.getThread(OWNER, "t1")
    expect(repo.findLatestMessages).toHaveBeenCalledWith(DEFAULT_DB, "t1", 200)
    expect(out.thread.id).toBe("t1")
    const answer = out.messages[1]
    expect(answer).toMatchObject({ role: "assistant", partial: true })
    expect(answer.toolEvents).toEqual([{ type: "tool", name: "get_sprint_metrics", ms: 12 }, { type: "proposal", proposal: PROPOSAL }])
    const decoded = decodeChatStream(answer.content)
    expect(decoded.text).toBe("Answer")
    expect(decoded.events).toEqual([{ type: "proposal", proposal: PROPOSAL }])
  })
})

describe("chat turn persistence", () => {
  it("resolveChatThread: undefined = new chat, owned id passes, foreign id is 404", async () => {
    expect(await svc.resolveChatThread(OWNER, undefined)).toBeNull()
    expect(await svc.resolveChatThread(OWNER, "t1")).toBe("t1")
    vi.mocked(repo.findOwnedThread).mockResolvedValue(null)
    await expect(svc.resolveChatThread(OWNER, "t2")).rejects.toBeInstanceOf(NotFoundError)
  })

  it("the first user message creates the thread with a derived title", async () => {
    expect(await svc.recordUserMessage(OWNER, null, "  How is the sprint?  ")).toBe("new")
    expect(repo.createThread).toHaveBeenCalledWith(TX, OWNER, "How is the sprint?")
    expect(repo.insertMessage).toHaveBeenCalledWith(TX, { threadId: "new", role: "user", content: "  How is the sprint?  " })
    expect(repo.touchThread).not.toHaveBeenCalled()
  })

  it("a follow-up message is appended and bumps the thread", async () => {
    expect(await svc.recordUserMessage(OWNER, "t1", "next")).toBe("t1")
    expect(repo.createThread).not.toHaveBeenCalled()
    expect(repo.touchThread).toHaveBeenCalledWith(TX, "t1", expect.any(Date))
  })

  it("stores decoded text, tool calls and proposals of the answer", async () => {
    const raw = `Here${encodeChatEvent({ type: "proposal", proposal: PROPOSAL })} you go`
    expect(await svc.recordAssistantMessage("t1", { raw, tools: [{ name: "propose_pbi", ms: 5 }], partial: false })).toBe(true)
    const stored = vi.mocked(repo.insertMessage).mock.calls[0][1]
    expect(stored).toMatchObject({ threadId: "t1", role: "assistant", content: "Here you go", partial: false })
    expect(JSON.parse(stored.toolEvents!)).toEqual([
      { type: "tool", name: "propose_pbi", ms: 5 },
      { type: "proposal", proposal: PROPOSAL },
    ])
    expect(repo.touchThread).toHaveBeenCalledWith(TX, "t1", expect.any(Date))
  })

  it("skips an empty answer and never throws on a DB failure", async () => {
    expect(await svc.recordAssistantMessage("t1", { raw: "  ", tools: [], partial: true })).toBe(false)
    expect(repo.insertMessage).not.toHaveBeenCalled()
    vi.mocked(repo.insertMessage).mockRejectedValue(new Error("db down"))
    expect(await svc.recordAssistantMessage("t1", { raw: "partial", tools: [], partial: true })).toBe(false)
  })
})

describe("tool events serialization", () => {
  it("drops trailing events until the JSON fits the column", () => {
    const big = Array.from({ length: 10 }, (_, i) => ({ type: "tool" as const, name: `${"x".repeat(9000)}${i}`, ms: 1 }))
    const json = svc.serializeToolEvents(big)!
    const parsed = JSON.parse(json) as unknown[]
    expect(parsed.length).toBeLessThan(10)
    expect(Buffer.byteLength(json)).toBeLessThanOrEqual(60_000)
    expect(svc.serializeToolEvents([])).toBeNull()
  })

  it("parseToolEvents tolerates garbage", () => {
    expect(svc.parseToolEvents("{bad")).toEqual([])
    expect(svc.parseToolEvents('{"a":1}')).toEqual([])
    expect(svc.parseToolEvents(null)).toEqual([])
  })
})

describe("ChatTurnRecorder", () => {
  it("collects chunks and tools and saves once", async () => {
    const save = vi.fn(async () => true)
    const rec = new svc.ChatTurnRecorder("t1", save)
    rec.append("Hel")
    rec.append("lo")
    rec.tool("get_velocity_history", 30)
    await rec.finish({ partial: true })
    rec.append("ignored")
    await rec.finish({ partial: false })
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith("t1", { raw: "Hello", tools: [{ name: "get_velocity_history", ms: 30 }], partial: true })
  })
})

describe("beginChatRecording", () => {
  it("records the final user message and returns a recorder for the thread", async () => {
    const rec = await svc.beginChatRecording(OWNER, null, { role: "user", content: "Hi" })
    expect(rec?.threadId).toBe("new")
    expect(repo.insertMessage).toHaveBeenCalledWith(TX, { threadId: "new", role: "user", content: "Hi" })
  })

  it("does nothing when the request does not end with a user message", async () => {
    expect(await svc.beginChatRecording(OWNER, "t1", { role: "assistant", content: "x" })).toBeNull()
    expect(await svc.beginChatRecording(OWNER, "t1", undefined)).toBeNull()
    expect(repo.insertMessage).not.toHaveBeenCalled()
  })

  it("returns null (chat continues unsaved) when storing fails", async () => {
    vi.mocked(repo.insertMessage).mockRejectedValue(new Error("db down"))
    expect(await svc.beginChatRecording(OWNER, "t1", { role: "user", content: "Hi" })).toBeNull()
  })
})
