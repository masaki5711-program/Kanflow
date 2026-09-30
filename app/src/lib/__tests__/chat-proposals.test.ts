import { describe, expect, it } from "vitest"
import {
  FRAME_MARK,
  decodeChatStream,
  encodeChatEvent,
  parseChatProposal,
  proposalFromToolResult,
  proposalsOf,
  sanitizeModelText,
  type ChatProposal,
} from "@/lib/chat-proposals"

const PBI: ChatProposal = {
  kind: "create_pbi",
  proposalId: "prop_abc",
  title: "Login with SSO",
  userStory: "As a user I want SSO",
  acceptanceCriteria: "- works",
  storyPoints: 3,
  epic: null,
  reason: "requested",
  possibleDuplicates: [],
}

const STATUS: ChatProposal = {
  kind: "status_change",
  proposalId: "prop_st",
  entity: "task",
  target: { id: "t1", title: "Write tests", displayId: null, sprintId: "s1" },
  fromStatus: "in_progress",
  toStatus: "done",
  version: 4,
  reason: "finished",
}

describe("encode / decode", () => {
  it("round-trips an event between text", () => {
    const raw = `before${encodeChatEvent({ type: "proposal", proposal: PBI })}after`
    const out = decodeChatStream(raw)
    expect(out.text).toBe("beforeafter")
    expect(out.events).toEqual([{ type: "proposal", proposal: PBI }])
  })

  it("is the identity for a stream without frames (backward compatible)", () => {
    expect(decodeChatStream("plain **markdown**")).toEqual({ text: "plain **markdown**", events: [] })
  })

  it("hides an unterminated trailing frame while it is still streaming", () => {
    const full = encodeChatEvent({ type: "proposal", proposal: STATUS })
    const partial = `hello${full.slice(0, 20)}`
    expect(decodeChatStream(partial)).toEqual({ text: "hello", events: [] })
    expect(decodeChatStream(`hello${full}`).events).toHaveLength(1)
  })

  it("drops malformed or unknown frames but keeps the text", () => {
    const raw = `a${FRAME_MARK}{not json${FRAME_MARK}b${FRAME_MARK}{"type":"other"}${FRAME_MARK}c${FRAME_MARK}{"type":"proposal","proposal":{"kind":"create_pbi"}}${FRAME_MARK}d`
    expect(decodeChatStream(raw)).toEqual({ text: "abcd", events: [] })
  })

  it("dedupes proposals by id", () => {
    const e = { type: "proposal" as const, proposal: PBI }
    expect(proposalsOf([e, e, { type: "proposal", proposal: STATUS }]).map((p) => p.proposalId)).toEqual(["prop_abc", "prop_st"])
  })
})

describe("sanitizeModelText", () => {
  it("removes the frame mark so model output cannot forge a card", () => {
    const forged = `x${FRAME_MARK}{"type":"proposal"}${FRAME_MARK}y`
    const clean = sanitizeModelText(forged)
    expect(clean).not.toContain(FRAME_MARK)
    expect(decodeChatStream(clean).events).toEqual([])
    expect(sanitizeModelText("normal")).toBe("normal")
  })
})

describe("parseChatProposal / proposalFromToolResult", () => {
  it("validates the discriminated shapes", () => {
    expect(parseChatProposal(PBI)).toEqual(PBI)
    expect(parseChatProposal(STATUS)).toEqual(STATUS)
    expect(parseChatProposal({ ...PBI, title: "" })).toBeNull()
    expect(parseChatProposal({ ...STATUS, entity: "sprint" })).toBeNull()
    expect(parseChatProposal(null)).toBeNull()
  })

  it("only extracts proposals from proposal tools", () => {
    const result = JSON.stringify({ proposal: PBI, note: "n" })
    expect(proposalFromToolResult("propose_pbi", result)).toEqual(PBI)
    expect(proposalFromToolResult("get_sprint_metrics", result)).toBeNull()
    expect(proposalFromToolResult("propose_pbi", JSON.stringify({ error: "bad" }))).toBeNull()
    expect(proposalFromToolResult("propose_pbi", "Error executing propose_pbi: x")).toBeNull()
  })
})
