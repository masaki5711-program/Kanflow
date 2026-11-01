import { describe, expect, it } from "vitest"
import { planAcceptanceCriteriaBackfill } from "../acceptance-criteria.backfill"
import { formatAcId, parseAcRef } from "../acceptance-criteria.schemas"
import { SPLIT_ITEM_MAX, splitAcceptanceCriteria } from "../acceptance-criteria.split"

describe("splitAcceptanceCriteria (existing text → items)", () => {
  it("splits bullet lines (ASCII and Japanese bullets, checkboxes)", () => {
    expect(splitAcceptanceCriteria("- A\n* B\n・C\n● D\n- [ ] E\n[x] F")).toEqual(["A", "B", "C", "D", "E", "F"])
  })

  it("splits numbered lines (1. 1) 1、 (1) ①)", () => {
    expect(splitAcceptanceCriteria("1. first\n2) second\n3、third\n(4) fourth\n⑤ fifth")).toEqual(["first", "second", "third", "fourth", "fifth"])
  })

  it("keeps a continuation line with its item and ignores blank lines / CRLF", () => {
    expect(splitAcceptanceCriteria("- A\r\n  more of A\r\n\r\n- B")).toEqual(["A\nmore of A", "B"])
  })

  it("a block that cannot be split stays ONE item (line breaks kept)", () => {
    expect(splitAcceptanceCriteria("Login works\nand shows the home page")).toEqual(["Login works\nand shows the home page"])
    expect(splitAcceptanceCriteria("single sentence")).toEqual(["single sentence"])
  })

  it("does not mistake numbers or minus signs inside text for markers", () => {
    expect(splitAcceptanceCriteria("1.5倍の速度で動く")).toEqual(["1.5倍の速度で動く"])
    expect(splitAcceptanceCriteria("-5 ℃ でも動く")).toEqual(["-5 ℃ でも動く"])
  })

  it("keeps text before the first marker as its own item (nothing is dropped)", () => {
    expect(splitAcceptanceCriteria("次を満たす:\n- A\n- B")).toEqual(["次を満たす:", "A", "B"])
  })

  it("empty / blank / null → no items", () => {
    expect(splitAcceptanceCriteria("")).toEqual([])
    expect(splitAcceptanceCriteria("  \n \n")).toEqual([])
    expect(splitAcceptanceCriteria(null)).toEqual([])
    expect(splitAcceptanceCriteria("-\n- \n")).toEqual([])
  })

  it("clips one pathological item to the API limit", () => {
    expect(splitAcceptanceCriteria("x".repeat(SPLIT_ITEM_MAX + 50))[0]).toHaveLength(SPLIT_ITEM_MAX)
  })
})

describe("planAcceptanceCriteriaBackfill (idempotent)", () => {
  const pbi = (id: string, text: string | null, existingRows = 0) => ({ id, displayId: 1, acceptanceCriteria: text, existingRows })

  it("numbers items 1..n per PBI and reports what was split or kept", () => {
    const plan = planAcceptanceCriteriaBackfill([pbi("a", "- x\n- y"), pbi("b", "plain"), pbi("c", null), pbi("d", "  ")])
    expect(plan.inserts).toEqual([
      { pbiId: "a", seq: 1, text: "x" },
      { pbiId: "a", seq: 2, text: "y" },
      { pbiId: "b", seq: 1, text: "plain" },
    ])
    expect(plan.stats).toMatchObject({ pbisScanned: 4, pbisWithText: 2, migrated: 2, split: 1, kept: 1, items: 3, alreadyMigrated: 0 })
  })

  it("a re-run plans nothing for a PBI that has any row (a deleted item is not brought back)", () => {
    const plan = planAcceptanceCriteriaBackfill([pbi("a", "- x\n- y", 2), pbi("b", "z", 1)])
    expect(plan.inserts).toEqual([])
    expect(plan.stats.alreadyMigrated).toBe(2)
  })
})

describe("acceptance criterion ids", () => {
  it("formats PBI-<n>/AC-<seq>", () => {
    expect(formatAcId(12, 2)).toBe("PBI-12/AC-2")
  })

  it("parses AC-2, ac2, 2 and PBI-12/AC-2; refuses the rest", () => {
    for (const ref of ["AC-2", "ac2", "2", " 2 ", "PBI-12/AC-2", "pbi12/ac-2"]) expect(parseAcRef(ref)).toBe(2)
    for (const ref of ["", "AC-", "0", "AC-0", "x2", "cm1abc", "2.5", "-2"]) expect(parseAcRef(ref)).toBeNull()
  })
})
