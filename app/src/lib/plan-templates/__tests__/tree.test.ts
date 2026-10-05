import { describe, expect, it } from "vitest"
import type { TemplateNode } from "../schema"
import { buildApplyRows, checklistToNotes, flattenStages, isExcluded, notesToChecklist } from "../tree"

const STAGES: TemplateNode[] = [
  { name: "仕様決定", durationDays: 20, checklist: ["仕様書承認済み"], children: [{ name: "要求整理", durationDays: 7 }, { name: "見積", durationDays: 10 }] },
  { name: "発注", durationDays: 10 },
  { name: "検収", isMilestone: true, durationDays: 1, children: [{ name: "能力確認" }] },
  { name: "引き渡し", isMilestone: true },
]

describe("plan template tree", () => {
  it("flattenStages gives depth-first dotted paths", () => {
    expect(flattenStages(STAGES).map((s) => [s.path, s.parentPath, s.depth])).toEqual([
      ["0", null, 0],
      ["0.0", "0", 1],
      ["0.1", "0", 1],
      ["1", null, 0],
      ["2", null, 0],
      ["2.0", "2", 1],
      ["3", null, 0],
    ])
  })

  it("isExcluded covers the path and its ancestors", () => {
    const ex = new Set(["0"])
    expect(isExcluded("0", ex)).toBe(true)
    expect(isExcluded("0.1", ex)).toBe(true)
    expect(isExcluded("1", ex)).toBe(false)
    expect(isExcluded("10", ex)).toBe(false)
  })

  it("buildApplyRows keeps parents first with sibling indexes, copies durations and the checklist", () => {
    const rows = buildApplyRows(STAGES)
    expect(rows.map((r) => [r.path, r.parentPath, r.siblingIndex])).toEqual([
      ["0", null, 0],
      ["0.0", "0", 0],
      ["0.1", "0", 1],
      ["1", null, 1],
      ["2", null, 2],
      ["2.0", "2", 0],
      ["3", null, 3],
    ])
    expect(rows[0]).toMatchObject({ name: "仕様決定", durationDays: 20, notes: "完了条件:\n- 仕様書承認済み", isMilestone: false })
    expect(rows[1]).toMatchObject({ durationDays: 7, notes: null })
  })

  it("a stage with kept children is never a milestone; without them it is", () => {
    expect(buildApplyRows(STAGES).find((r) => r.path === "2")?.isMilestone).toBe(false)
    expect(buildApplyRows(STAGES, ["2.0"]).find((r) => r.path === "2")?.isMilestone).toBe(true)
  })

  it("excludePaths drop whole subtrees and re-number the kept siblings", () => {
    const rows = buildApplyRows(STAGES, ["0", "2.0"])
    expect(rows.map((r) => [r.path, r.siblingIndex])).toEqual([
      ["1", 0],
      ["2", 1],
      ["3", 2],
    ])
    expect(buildApplyRows(STAGES, ["0", "1", "2", "3"])).toEqual([])
  })

  it("checklist ⇄ notes round-trips and ignores unrelated notes", () => {
    const notes = checklistToNotes([" a ", "", "b"])
    expect(notes).toBe("完了条件:\n- a\n- b")
    expect(notesToChecklist(notes)).toEqual(["a", "b"])
    expect(notesToChecklist(`メモ\n${notes}\n\n後書き`)).toEqual(["a", "b"])
    expect(checklistToNotes([])).toBeNull()
    expect(notesToChecklist("ただのメモ")).toEqual([])
    expect(notesToChecklist(null)).toEqual([])
  })
})
