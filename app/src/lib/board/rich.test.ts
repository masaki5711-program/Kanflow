import { describe, expect, it } from "vitest"
import { applyMarks, normalizeRuns, plainRuns, rangeFontSize, rangeHas, runsFor, runsIn, runsText, truncateRuns, type BaseMarks } from "./rich"

const BASE: BaseMarks = { bold: false, italic: false, underline: false, fontSize: 14, fontFamily: "sans", color: "fg" }

describe("formatted text runs (B6, synthetic)", () => {
  it("formats a stretch in the middle and leaves the rest plain", () => {
    expect(applyMarks(plainRuns("abcdef"), 2, 4, { bold: true })).toEqual([{ text: "ab" }, { text: "cd", bold: true }, { text: "ef" }])
  })

  it("joins neighbours with the same marks and drops the runs when nothing is formatted any more", () => {
    const bold = applyMarks(plainRuns("abcdef"), 2, 4, { bold: true }) ?? []
    expect(applyMarks(bold, 0, 2, { bold: true })).toEqual([{ text: "abcd", bold: true }, { text: "ef" }])
    expect(applyMarks(bold, 2, 4, { bold: undefined })).toBeNull()
  })

  it("keeps several marks on overlapping stretches", () => {
    const one = applyMarks(plainRuns("abcdef"), 0, 4, { fontSize: 24 }) ?? []
    const two = applyMarks(one, 2, 6, { color: "red" }) ?? []
    expect(two).toEqual([{ text: "ab", fontSize: 24 }, { text: "cd", fontSize: 24, color: "red" }, { text: "ef", color: "red" }])
    expect(runsText(two)).toBe("abcdef")
  })

  it("an empty range changes nothing", () => {
    expect(applyMarks(plainRuns("abc"), 1, 1, { bold: true })).toBeNull()
  })

  it("uses runs only when they add up to the text", () => {
    const runs = [{ text: "ab", bold: true }, { text: "c" }]
    expect(runsFor("abc", runs)).toBe(runs)
    // Someone changed the plain text with a build that does not know runs: they are ignored.
    expect(runsFor("abcd", runs)).toBeNull()
    expect(runsFor("abc", null)).toBeNull()
    expect(runsFor("abc", [])).toBeNull()
  })

  it("reads the format of a range against the box's own", () => {
    const runs = [{ text: "ab", bold: true }, { text: "cd" }, { text: "ef", fontSize: 20 }]
    expect(rangeHas(runs, 0, 2, BASE, "bold")).toBe(true)
    expect(rangeHas(runs, 0, 3, BASE, "bold")).toBe(false)
    expect(rangeHas(runs, 2, 4, { ...BASE, bold: true }, "bold")).toBe(true)
    expect(rangeFontSize(runs, 0, 4, BASE)).toBe(14)
    expect(rangeFontSize(runs, 3, 6, BASE)).toBeNull()
    expect(runsIn(runs, 1, 5).map((r) => r.text)).toEqual(["b", "cd", "e"])
  })

  it("normalizes: empty runs go, more runs than the server accepts are dropped", () => {
    expect(normalizeRuns([{ text: "" }, { text: "a", italic: true }])).toEqual([{ text: "a", italic: true }])
    const many = Array.from({ length: 401 }, (_, i) => ({ text: "x", bold: i % 2 === 0 }))
    expect(normalizeRuns(many)).toBeNull()
  })

  it("cuts runs together with the text", () => {
    expect(truncateRuns([{ text: "abc", bold: true }, { text: "def" }], 4)).toEqual([{ text: "abc", bold: true }, { text: "d" }])
  })
})
