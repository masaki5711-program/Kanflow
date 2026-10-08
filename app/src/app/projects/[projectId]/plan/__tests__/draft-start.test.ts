import { describe, expect, it } from "vitest"
import { suggestDraftStart } from "../lib/draft-start"

type Node = { id: string; parentId: string | null; plannedStart: string | null; plannedEnd: string | null }
const n = (id: string, parentId: string | null, plannedStart: string | null, plannedEnd: string | null): Node => ({ id, parentId, plannedStart, plannedEnd })

const TODAY = "2026-10-08"

describe("suggestDraftStart (where the calendar of a new plan item opens)", () => {
  it("is today when nothing in the plan is dated", () => {
    expect(suggestDraftStart([], null, TODAY)).toBe(TODAY)
    expect(suggestDraftStart([n("a", null, null, null)], null, TODAY)).toBe(TODAY)
  })

  it("follows the last dated sibling: the day after its end", () => {
    const items = [n("a", null, "2027-01-04", "2027-02-26"), n("b", null, "2027-03-01", "2027-06-30"), n("c", "a", "2027-01-04", "2027-01-20")]
    expect(suggestDraftStart(items, null, TODAY)).toBe("2027-07-01")
  })

  it("under a parent: after that parent's last dated child", () => {
    const items = [n("p", null, "2027-01-04", "2027-03-31"), n("c1", "p", "2027-01-04", "2027-01-20"), n("c2", "p", "2027-01-21", "2027-02-10"), n("x", null, "2027-04-01", "2027-12-31")]
    expect(suggestDraftStart(items, "p", TODAY)).toBe("2027-02-11")
  })

  it("under a dated parent without dated children: the parent's start", () => {
    const items = [n("p", null, "2027-05-10", "2027-05-20"), n("u", "p", null, null)]
    expect(suggestDraftStart(items, "p", TODAY)).toBe("2027-05-10")
  })

  it("under an undated parent: after the end of the whole plan, else today", () => {
    const items = [n("p", null, null, null), n("x", null, "2027-04-01", "2027-04-30")]
    expect(suggestDraftStart(items, "p", TODAY)).toBe("2027-05-01")
    expect(suggestDraftStart([n("p", null, null, null)], "p", TODAY)).toBe(TODAY)
  })

  it("ignores half-dated rows", () => {
    expect(suggestDraftStart([n("a", null, "2027-01-04", null)], null, TODAY)).toBe(TODAY)
  })
})
