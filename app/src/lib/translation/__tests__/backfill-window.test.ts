import { describe, expect, it } from "vitest"
import { inBackfillWindow, parseBackfillWindow } from "../backfill-window"

const at = (h: number) => new Date(2026, 9, 2, h, 30)

describe("English backfill window", () => {
  it("defaults to 19:00–07:00 across midnight", () => {
    expect(parseBackfillWindow(undefined)).toEqual({ from: 19, to: 7 })
    expect(inBackfillWindow(undefined, at(19))).toBe(true)
    expect(inBackfillWindow(undefined, at(2))).toBe(true)
    expect(inBackfillWindow(undefined, at(7))).toBe(false)
    expect(inBackfillWindow(undefined, at(12))).toBe(false)
  })

  it("supports a same-day window", () => {
    expect(inBackfillWindow("9-17", at(9))).toBe(true)
    expect(inBackfillWindow("9-17", at(17))).toBe(false)
    expect(inBackfillWindow("9-17", at(3))).toBe(false)
  })

  it("supports always / off", () => {
    expect(inBackfillWindow("always", at(12))).toBe(true)
    expect(inBackfillWindow("off", at(23))).toBe(false)
  })

  it("falls back to the default on malformed input", () => {
    expect(parseBackfillWindow("evening")).toEqual({ from: 19, to: 7 })
    expect(parseBackfillWindow("25-3")).toEqual({ from: 19, to: 7 })
  })
})
