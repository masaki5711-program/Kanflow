import { describe, expect, it } from "vitest"
import { formatDateRange, formatDateTime, formatLongDate, formatRelative, formatShortDate } from "../format-date"

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

  it("drops only the weekday with { weekday: false } (chart axes)", () => {
    expect(formatShortDate(sep8, "ja", { weekday: false })).toBe("9/8")
    expect(formatShortDate(sep8, "id", { weekday: false })).toBe("8 Sep")
    expect(formatShortDate(sep8, "en", { weekday: false })).toBe("Sep 8")
    expect(formatShortDate(sep8, "ja")).toBe("9/8(火)")
  })

  it("returns an empty string for an invalid date", () => {
    expect(formatShortDate("not-a-date", "ja")).toBe("")
  })
})

describe("formatLongDate / formatDateRange / formatDateTime / formatRelative (A3-14)", () => {
  it.each([
    ["ja", "2026/9/8"],
    ["en", "Sep 8, 2026"],
    ["id", "8 Sep 2026"],
  ] as const)("long date with the year (%s → %s)", (language, expected) => {
    expect(formatLongDate(sep8, language)).toBe(expected)
  })

  it("reads calendar days stored as UTC midnight in UTC", () => {
    expect(formatLongDate("2026-08-27T00:00:00.000Z", "ja", { utc: true })).toBe("2026/8/27")
    expect(formatLongDate("2026-09-30", "id")).toBe("30 Sep 2026")
    expect(formatLongDate("2026-09-30", "ja", { utc: true })).toBe("2026/9/30")
  })

  it("one range format everywhere (never '~' or '-' variants)", () => {
    const start = "2026-08-27T00:00:00.000Z"
    const end = "2026-09-08T00:00:00.000Z"
    expect(formatDateRange(start, end, "ja", { utc: true })).toBe("2026/8/27 – 2026/9/8")
    expect(formatDateRange(start, end, "id", { utc: true })).toBe("27 Agu 2026 – 8 Sep 2026")
    expect(formatDateRange(start, end, "en", { utc: true, year: false })).toBe("Aug 27 – Sep 8")
    expect(formatDateRange("bad", end, "ja", { utc: true })).toBe("… – 2026/9/8")
  })

  it("date-time keeps the same day format plus hh:mm", () => {
    const at = new Date(2026, 8, 8, 14, 5)
    expect(formatDateTime(at, "ja")).toBe("2026/9/8 14:05")
    expect(formatDateTime(at, "id")).toMatch(/^8 Sep 2026.*14\.05$/)
    expect(formatDateTime("nope", "en")).toBe("")
  })

  it("relative time up to a week, then the short / long date", () => {
    const now = new Date(2026, 8, 30, 12, 0)
    expect(formatRelative(new Date(2026, 8, 30, 11, 57), now, "en")).toBe("3 minutes ago")
    expect(formatRelative(new Date(2026, 8, 29, 12, 0), now, "ja")).toBe("昨日")
    expect(formatRelative(new Date(2026, 7, 1, 12, 0), now, "id")).toBe("1 Agu")
    expect(formatRelative(new Date(2025, 7, 1, 12, 0), now, "ja")).toBe("2025/8/1")
    expect(formatRelative("x", now, "ja")).toBe("")
  })
})
