import { describe, expect, it } from "vitest"
import { encodeChatEvent, type ChatProposal } from "@/lib/chat-proposals"
import { threadUrl, toChatMessages, toRequestHistory, toStoredThread, toThreadPage } from "../chat-history"

const PROPOSAL: ChatProposal = {
  kind: "create_pbi", proposalId: "prop_1", title: "SSO", userStory: "", acceptanceCriteria: "",
  storyPoints: 3, epic: null, reason: "", possibleDuplicates: [],
}

describe("toChatMessages", () => {
  it("maps stored turns; decodes proposal frames; partial answers show as stopped", () => {
    const out = toChatMessages([
      { id: "m1", role: "user", content: "Q", partial: false, createdAt: "" },
      { id: "m2", role: "assistant", content: `A${encodeChatEvent({ type: "proposal", proposal: PROPOSAL })}`, partial: true, createdAt: "" },
      { id: "m3", role: "assistant", content: "B", partial: false, createdAt: "" },
    ])
    expect(out).toEqual([
      { id: "m1", role: "user", content: "Q" },
      { id: "m2", role: "assistant", content: "A", proposals: [PROPOSAL], stopped: true },
      { id: "m3", role: "assistant", content: "B" },
    ])
  })
})

describe("toRequestHistory", () => {
  it("keeps the newest 40 non-empty messages, each cut to 8000 chars", () => {
    const msgs = Array.from({ length: 45 }, (_, i) => ({ role: i % 2 ? ("assistant" as const) : ("user" as const), content: `m${i}` }))
    const out = toRequestHistory([...msgs, { role: "assistant", content: "  " }, { role: "user", content: "x".repeat(9000) }])
    expect(out).toHaveLength(40)
    expect(out[out.length - 1].content).toHaveLength(8000)
    expect(out[0].content).toBe("m6")
  })
})

describe("parsers and urls", () => {
  it("tolerate unexpected bodies", () => {
    expect(toThreadPage(null)).toEqual({ items: [], nextCursor: null })
    expect(toThreadPage({ items: [{ id: "t" }], nextCursor: "c" })).toEqual({ items: [{ id: "t" }], nextCursor: "c" })
    expect(toStoredThread({ ok: true })).toBeNull()
    expect(toStoredThread({ thread: { id: "t" }, messages: [] })).toEqual({ thread: { id: "t" }, messages: [] })
  })

  it("encodes ids in urls", () => {
    expect(threadUrl("p 1", "t/1")).toBe("/api/projects/p%201/chat/threads/t%2F1")
  })
})
