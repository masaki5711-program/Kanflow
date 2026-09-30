import { describe, expect, it } from "vitest"
import { axisLabels, clipText, textUnits, unitsForWidth, wrapLabel } from "./velocity-labels"

describe("textUnits / clipText / unitsForWidth", () => {
  it("counts CJK characters as two units", () => {
    expect(textUnits("Sprint 1")).toBe(8)
    expect(textUnits("第9週")).toBe(5)
  })

  it("clips with an ellipsis within the unit budget", () => {
    expect(clipText("Sprint", 10)).toBe("Sprint")
    expect(clipText("Sprint penentuan", 10)).toBe("Sprint pe…")
    expect(textUnits(clipText("スプリントテーマ決定", 7))).toBeLessThanOrEqual(7)
  })

  it("derives the units from the slot width (never below 4)", () => {
    expect(unitsForWidth(66, 12)).toBe(10)
    expect(unitsForWidth(5, 12)).toBe(4)
  })
})

describe("wrapLabel", () => {
  it("wraps on spaces onto two lines and clips the rest", () => {
    expect(wrapLabel("Sprint 1", 10)).toEqual(["Sprint 1"])
    expect(wrapLabel("Sprint Minggu ke 6", 10)).toEqual(["Sprint", "Minggu ke…"])
    expect(wrapLabel("Sprint penentuan tema dan area pilot project", 10)).toEqual(["Sprint", "penentuan…"])
  })

  it("breaks text without spaces (Japanese) by characters", () => {
    const lines = wrapLabel("第9週スプリント", 10)
    expect(lines).toEqual(["第9週スプ", "リント"])
    for (const l of lines) expect(textUnits(l)).toBeLessThanOrEqual(10)
  })
})

describe("axisLabels (A4-02: labels must be told apart)", () => {
  it("keeps distinct wrapped labels as they are", () => {
    expect(axisLabels(["Sprint 1", "Sprint 2"], 10)).toEqual([["Sprint 1"], ["Sprint 2"]])
  })

  it("shows the distinctive end of names whose wrapped labels collide", () => {
    const labels = axisLabels(["Sprint Minggu ke 5", "Sprint Minggu ke 6", "Sprint Minggu ke 7"], 10)
    expect(labels).toEqual([["Sprint", "…ke 5"], ["Sprint", "…ke 6"], ["Sprint", "…ke 7"]])
  })

  it("never returns two equal labels, even for identical names", () => {
    const names = ["Sprint penentuan tema A", "Sprint penentuan tema B", "Same", "Same"]
    const labels = axisLabels(names, 10).map((l) => l.join("\n"))
    expect(new Set(labels).size).toBe(names.length)
    for (const l of axisLabels(names, 10).flat()) expect(textUnits(l)).toBeLessThanOrEqual(10)
  })

  it("falls back to a character tail for a long last word", () => {
    const labels = axisLabels(["スプリント計画準備会議その一", "スプリント計画準備会議その二"], 10)
    expect(labels[0][1]).toMatch(/^….*一$/)
    expect(labels[1][1]).toMatch(/^….*二$/)
  })
})
