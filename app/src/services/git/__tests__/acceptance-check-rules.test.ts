import { describe, expect, it } from "vitest"
import { evaluateAcceptance, SUMMARY_KEY_LIMIT, type AcceptancePbi } from "../acceptance-check-rules"

const ready = (displayId: number): AcceptancePbi => ({ displayId, inOpenSprint: true, evidenceKinds: ["test"] })

describe("evaluateAcceptance (kanflow/acceptance)", () => {
  it("success: every PBI has a task in an open sprint and criteria with their way of proof", () => {
    const verdict = evaluateAcceptance([ready(12), { displayId: 3, inOpenSprint: true, evidenceKinds: ["test", "inspection", "approval"] }])
    expect(verdict.conclusion).toBe("success")
    expect(verdict.summary).toBe("受入の準備ができています（開いているスプリントにタスクがあり、受入基準ごとに確認の方法が決まっています）。\n確認した PBI: PBI-3, PBI-12")
  })

  it("action_required: names what is missing, per kind, with the PBI keys in key order", () => {
    const verdict = evaluateAcceptance([
      { displayId: 9, inOpenSprint: false, evidenceKinds: ["test"] },
      { displayId: 2, inOpenSprint: true, evidenceKinds: [] },
      { displayId: 5, inOpenSprint: true, evidenceKinds: ["test", null] },
      ready(7),
    ])
    expect(verdict.conclusion).toBe("action_required")
    expect(verdict.summary.split("\n")).toEqual([
      "受入の準備が足りません。Kanflow で次を整えてください。",
      "開いているスプリントにタスクがない: PBI-9",
      "受入基準がない: PBI-2",
      "確認の方法が未定の受入基準がある: PBI-5",
      "確認した PBI: PBI-2, PBI-5, PBI-7, PBI-9",
    ])
  })

  it("only the lines that apply are written; one PBI can be on several", () => {
    const verdict = evaluateAcceptance([{ displayId: 4, inOpenSprint: false, evidenceKinds: [] }])
    expect(verdict.summary.split("\n")).toEqual(["受入の準備が足りません。Kanflow で次を整えてください。", "開いているスプリントにタスクがない: PBI-4", "受入基準がない: PBI-4", "確認した PBI: PBI-4"])
    expect(evaluateAcceptance([{ displayId: 4, inOpenSprint: true, evidenceKinds: [null] }]).summary.split("\n")).toEqual([
      "受入の準備が足りません。Kanflow で次を整えてください。",
      "確認の方法が未定の受入基準がある: PBI-4",
      "確認した PBI: PBI-4",
    ])
  })

  it("an empty way of proof counts as not decided", () => {
    expect(evaluateAcceptance([{ displayId: 1, inOpenSprint: true, evidenceKinds: [""] }]).conclusion).toBe("action_required")
    expect(evaluateAcceptance([{ displayId: 1, inOpenSprint: true, evidenceKinds: ["measurement"] }]).conclusion).toBe("success")
  })

  it("no live PBI at all (every linked one deleted) asks a person to look at the link", () => {
    expect(evaluateAcceptance([])).toEqual({ conclusion: "action_required", summary: "ひも付いた PBI がすべて削除されています。Kanflow でひも付けを確認してください。" })
  })

  it(`lists at most ${SUMMARY_KEY_LIMIT} keys per line and counts the rest`, () => {
    const many = Array.from({ length: SUMMARY_KEY_LIMIT + 3 }, (_, i) => ready(100 - i))
    const lines = evaluateAcceptance(many).summary.split("\n")
    const first = Array.from({ length: SUMMARY_KEY_LIMIT }, (_, i) => `PBI-${78 + i}`).join(", ")
    expect(lines[1]).toBe(`確認した PBI: ${first} ほか 3 件`)
    const exact = evaluateAcceptance(many.slice(0, SUMMARY_KEY_LIMIT)).summary
    expect(exact).not.toContain("ほか")
    // The cap holds on every line, so the text stays far below GitStation's body limit (64 KiB).
    const worst = evaluateAcceptance(Array.from({ length: 5000 }, (_, i) => ({ displayId: 1_000_000 + i, inOpenSprint: false, evidenceKinds: [null] })))
    expect(worst.summary.split("\n")).toHaveLength(4)
    expect(Buffer.byteLength(worst.summary)).toBeLessThan(2000)
  })

  it("does not change its input, and the same input gives the same text (the digest depends on it)", () => {
    const input: AcceptancePbi[] = [ready(9), ready(2)]
    const a = evaluateAcceptance(input)
    expect(input.map((p) => p.displayId)).toEqual([9, 2])
    expect(evaluateAcceptance([ready(2), ready(9)])).toEqual(a)
  })
})
