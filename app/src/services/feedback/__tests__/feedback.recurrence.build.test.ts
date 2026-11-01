import { describe, expect, it } from "vitest"
import { asProposalLang, buildPreventionProposal, proposalId, threadMarker, type RecurrenceFacts } from "../feedback.recurrence"

const FACTS: RecurrenceFacts = {
  signature: "e".repeat(64),
  signatureText: "error: lock timeout\nretrying",
  tool: "cargo",
  errorCode: "FG-DB-0007",
  count: 6,
  windowDays: 30,
  lessonRecurred: false,
  projectName: "Forge",
  fix: "restart the runner",
  systemizedRef: null,
}

describe("buildPreventionProposal", () => {
  it.each(["ja", "en", "id"] as const)("%s: a valid create_pbi proposal with the signature, count, project, fix and the open question", (lang) => {
    const built = buildPreventionProposal(FACTS, lang)
    expect(built.proposal.kind).toBe("create_pbi")
    expect(built.proposal.proposalId).toBe(proposalId(FACTS.signature))
    const ac = built.proposal.acceptanceCriteria
    expect(ac).toContain("eeeeeeeeeeee")
    expect(ac).toContain("FG-DB-0007")
    expect(ac).toContain("6")
    expect(ac).toContain("Forge")
    expect(ac).toContain("restart the runner")
    expect(ac).toContain("________")
    expect(built.title.length).toBeLessThanOrEqual(190)
    expect(built.proposal.storyPoints).toBeNull()
  })

  it("says when a confirmed lesson came back, and mentions an earlier systemization", () => {
    const text = JSON.stringify(buildPreventionProposal({ ...FACTS, lessonRecurred: true, systemizedRef: "gate:lint" }, "en").proposal)
    expect(text).toContain("came back after the lesson was confirmed")
    expect(text).toContain("gate:lint")
  })

  it("the thread marker is short and stable; unknown languages fall back to Japanese", () => {
    expect(threadMarker(FACTS.signature)).toBe("[fb:eeeeeeeeeeee]")
    expect(asProposalLang("fr")).toBe("ja")
    expect(asProposalLang("id")).toBe("id")
  })
})
