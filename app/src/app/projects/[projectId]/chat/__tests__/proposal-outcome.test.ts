import { afterEach, describe, expect, it, vi } from "vitest"
import type { ChatProposal } from "@/lib/chat-proposals"
import { proposalOutcomeUrl, rejectProposal, reserveProposal, stateFromOutcome } from "../proposal-outcome"

const PROPOSAL: ChatProposal = {
  kind: "create_pbi", proposalId: "prop_1", title: "SSO", userStory: "", acceptanceCriteria: "",
  storyPoints: null, epic: null, reason: "", possibleDuplicates: [],
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

afterEach(() => vi.unstubAllGlobals())

describe("proposal outcome client", () => {
  it("builds the endpoint url", () => {
    expect(proposalOutcomeUrl("p 1", "t1", "prop_1")).toBe("/api/projects/p%201/chat/threads/t1/proposals/prop_1")
  })

  it("maps stored outcomes to card states", () => {
    const at = "2026-10-01T00:00:00.000Z"
    expect(stateFromOutcome("p1", PROPOSAL, { status: "applied", appliedEntityId: "pb9", at, by: "u" })).toEqual({
      status: "applied",
      href: "/projects/p1/backlog?pbi=pb9",
    })
    expect(stateFromOutcome("p1", PROPOSAL, { status: "rejected", appliedEntityId: null, at, by: "u" })).toEqual({ status: "rejected" })
    expect(stateFromOutcome("p1", PROPOSAL, { status: "applying", appliedEntityId: null, at, by: "u" })).toEqual({ status: "applying" })
  })

  it("reserve: unsaved chat and unknown proposal are untracked; 409 is taken; other errors throw", async () => {
    expect(await reserveProposal("p1", null, "prop_1")).toEqual({ kind: "untracked" })
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "nf" }, 404)))
    expect(await reserveProposal("p1", "t1", "prop_1")).toEqual({ kind: "untracked" })
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "x", outcome: { status: "bogus" } }, 409)))
    expect(await reserveProposal("p1", "t1", "prop_1")).toEqual({ kind: "taken", outcome: null })
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "down" }, 503)))
    await expect(reserveProposal("p1", "t1", "prop_1")).rejects.toThrow()
  })

  it("reject reports a conflicting outcome and swallows other failures", async () => {
    const applied = { status: "applied", appliedEntityId: "pb9", at: "2026-10-01T00:00:00.000Z", by: "u" }
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "x", outcome: applied }, 409)))
    expect(await rejectProposal("p1", "t1", "prop_1")).toEqual({ taken: applied })
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "down" }, 500)))
    expect(await rejectProposal("p1", "t1", "prop_1")).toBeNull()
    expect(await rejectProposal("p1", null, "prop_1")).toBeNull()
  })
})
