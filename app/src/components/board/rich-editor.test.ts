// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import type { BaseMarks } from "@/lib/board/rich"
import { readRuns, renderRuns, runsAfter } from "./rich-editor"

const BASE: BaseMarks = { bold: false, italic: false, underline: false, fontSize: 14, fontFamily: "sans", color: "fg" }

describe("rich text editor: DOM and runs (B6, synthetic)", () => {
  it("writes runs into the area and reads the same runs back", () => {
    const root = document.createElement("div")
    const runs = [{ text: "ab" }, { text: "cd", bold: true, fontSize: 20 }, { text: "e\nf", color: "red" as const }]
    renderRuns(root, runs, 1)
    expect(readRuns(root)).toEqual(runs)
    expect(root.querySelectorAll("span")).toHaveLength(3)
    expect((root.querySelectorAll("span")[1] as HTMLElement).style.fontWeight).toBe("700")
  })

  it("a trailing line break is held open by a <br> that is no character", () => {
    const root = document.createElement("div")
    renderRuns(root, [{ text: "ab\n" }], 1)
    expect(root.lastChild?.nodeName).toBe("BR")
    expect(readRuns(root).map((r) => r.text).join("")).toBe("ab\n")
  })

  it("a <br> the browser put between texts is a line break", () => {
    const root = document.createElement("div")
    root.append("ab", document.createElement("br"), "cd")
    expect(readRuns(root).map((r) => r.text).join("")).toBe("ab\ncd")
  })

  it("toggles a mark on a range against what the range already shows", () => {
    expect(runsAfter([{ text: "abcd" }], 1, 3, BASE, { toggle: "bold" })).toEqual([{ text: "a" }, { text: "bc", bold: true }, { text: "d" }])
    expect(runsAfter([{ text: "a" }, { text: "bc", bold: true }, { text: "d" }], 1, 3, BASE, { toggle: "bold" })).toBeNull()
    // In a bold box, "not bold" is stored for the stretch.
    expect(runsAfter([{ text: "abcd" }], 0, 2, { ...BASE, bold: true }, { toggle: "bold" })).toEqual([{ text: "ab", bold: false }, { text: "cd" }])
    expect(runsAfter([{ text: "abcd" }], 0, 4, BASE, { sizeStep: 1 })).toEqual([{ text: "abcd", fontSize: 16 }])
    // The box's own colour is no mark.
    expect(runsAfter([{ text: "ab", color: "red" }], 0, 2, { ...BASE, color: "red" }, { color: "red" })).toBeNull()
  })
})
