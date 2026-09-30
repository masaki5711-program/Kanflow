import { describe, expect, it } from "vitest"
import { actualPoints, isWeekend, labelInterval, linePath, makeScale, PADDING, yTicks, type BurndownData } from "./burndown-geometry"

const data: BurndownData = {
  days: ["2026-09-18", "2026-09-19", "2026-09-20"],
  totalTasks: 4,
  idealLine: [4, 2, 0],
  planLine: [4, 4, 0],
  actualLine: [null, 3, null],
  actualBaseline: 4,
  sprintMarkers: [],
}

describe("burndown geometry", () => {
  it("prepends the baseline at the first actual index", () => {
    expect(actualPoints(data)).toEqual([{ x: 1, y: 4 }, { x: 1, y: 3 }])
    expect(actualPoints({ actualLine: [null, null], actualBaseline: 5 })).toEqual([])
  })

  it("builds integer ticks ending on the max", () => {
    expect(yTicks(4)).toEqual([0, 1, 2, 3, 4])
    expect(yTicks(12)).toEqual([0, 5, 10, 12])
    expect(yTicks(0.4)).toEqual([0, 1])
  })

  it("thins X labels for long ranges", () => {
    expect(labelInterval(10)).toBe(1)
    expect(labelInterval(20)).toBe(2)
    expect(labelInterval(45)).toBe(4)
    expect(labelInterval(90)).toBe(6)
  })

  it("maps the first day to the left padding and skips null values in paths", () => {
    const scale = makeScale(data, actualPoints(data))
    expect(scale.toX(0)).toBe(PADDING.left)
    expect(linePath([null, 2, null, 0], scale).startsWith("M ")).toBe(true)
    expect(linePath([null, 2, null, 0], scale).split("L").length).toBe(2)
  })

  it("detects weekends", () => {
    expect(isWeekend("2026-09-19")).toBe(true)
    expect(isWeekend("2026-09-21")).toBe(false)
  })
})
