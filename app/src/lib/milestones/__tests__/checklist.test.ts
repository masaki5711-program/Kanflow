import { describe, expect, it } from "vitest"
import { CHECKLIST_LABEL_MAX, checklistKey, replaceConditionsInNotes, stageConditions } from "../checklist"

describe("stageConditions", () => {
  it("reads the 完了条件 block written by plan templates, deduplicated", () => {
    expect(stageConditions("メモ\n完了条件:\n- 仕様書承認済み\n- 予算承認\n- 予算承認\n\n後書き")).toEqual(["仕様書承認済み", "予算承認"])
    expect(stageConditions(null)).toEqual([])
  })

  it("keys are trimmed and capped to the label column", () => {
    expect(checklistKey("  a  ")).toBe("a")
    expect(checklistKey("x".repeat(300))).toHaveLength(CHECKLIST_LABEL_MAX)
  })
})

describe("replaceConditionsInNotes", () => {
  it("replaces only the block and keeps the rest of the notes", () => {
    expect(replaceConditionsInNotes("前書き\n完了条件:\n- a\n- b\n後書き", ["a", "c"])).toBe("前書き\n完了条件:\n- a\n- c\n後書き")
  })

  it("appends a block to notes without one, and removes the block when empty", () => {
    expect(replaceConditionsInNotes("メモ", ["検収書を受領"])).toBe("メモ\n\n完了条件:\n- 検収書を受領")
    expect(replaceConditionsInNotes(null, ["x"])).toBe("完了条件:\n- x")
    expect(replaceConditionsInNotes("完了条件:\n- a", [])).toBeNull()
    expect(replaceConditionsInNotes("メモ\n完了条件:\n- a", [])).toBe("メモ")
  })
})
