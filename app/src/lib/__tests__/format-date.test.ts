import { describe, expect, it } from "vitest"
import { formatShortDate } from "../format-date"

// Local-time dates, so the result does not depend on the test machine's time zone.
const sep8 = new Date(2026, 8, 8, 12, 0)

describe("formatShortDate", () => {
  it.each([
    ["ja", "9/8(火)"],
    ["en", "Sep 8"],
    ["id", "8 Sep"],
  ] as const)("formats per UI language (%s → %s)", (language, expected) => {
    expect(formatShortDate(sep8, language)).toBe(expected)
  })

  it("accepts ISO strings (the day is never shown as M/D to an Indonesian reader)", () => {
    const oct7 = new Date(2026, 9, 7, 9, 0).toISOString()
    expect(formatShortDate(oct7, "id")).toBe("7 Okt")
    expect(formatShortDate(oct7, "en")).toBe("Oct 7")
    expect(formatShortDate(oct7, "ja")).toBe("10/7(水)")
  })

  it("returns an empty string for an invalid date", () => {
    expect(formatShortDate("not-a-date", "ja")).toBe("")
  })
})
