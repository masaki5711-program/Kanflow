import { describe, expect, it } from "vitest"
import { dateLocale, defaultDateInRange, toLocalIsoDate } from "./locale"

describe("sprint locale helpers", () => {
  it("dateLocale maps UI languages", () => {
    expect(dateLocale("ja")).toBe("ja-JP")
    expect(dateLocale("id")).toBe("id-ID")
    expect(dateLocale("en")).toBe("en-US")
  })

  it("toLocalIsoDate formats a local date", () => {
    expect(toLocalIsoDate(new Date(2026, 0, 5))).toBe("2026-01-05")
  })

  it("defaultDateInRange keeps today inside the sprint", () => {
    expect(defaultDateInRange("2026-09-05", "2026-09-01", "2026-09-14")).toBe("2026-09-05")
  })

  it("defaultDateInRange uses the sprint end date for an ended sprint", () => {
    expect(defaultDateInRange("2026-09-23", "2026-09-01", "2026-09-14")).toBe("2026-09-14")
  })

  it("defaultDateInRange uses the sprint start date for a future sprint", () => {
    expect(defaultDateInRange("2026-08-20", "2026-09-01", "2026-09-14")).toBe("2026-09-01")
  })

  it("defaultDateInRange ignores missing / invalid bounds", () => {
    expect(defaultDateInRange("2026-09-23", "", "")).toBe("2026-09-23")
    expect(defaultDateInRange("2026-09-23", "bad", "bad")).toBe("2026-09-23")
  })
})
