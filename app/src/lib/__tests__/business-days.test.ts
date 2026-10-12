import { describe, expect, it } from "vitest"
import { addBusinessDays, businessDaysBetween, endOfBusinessSpan, isBusinessDay, isJapaneseHoliday, nextBusinessDay } from "../business-days"

describe("business-days", () => {
  it("knows the 2026 Japanese holidays incl. substitute and sandwiched days", () => {
    const holidays = ["2026-01-01", "2026-01-12", "2026-02-11", "2026-02-23", "2026-03-20", "2026-04-29", "2026-05-03", "2026-05-04", "2026-05-05", "2026-05-06", "2026-07-20", "2026-08-11", "2026-09-21", "2026-09-22", "2026-09-23", "2026-10-12", "2026-11-03", "2026-11-23"]
    for (const h of holidays) expect(isJapaneseHoliday(h), h).toBe(true)
    expect(isJapaneseHoliday("2026-10-13")).toBe(false)
  })

  it("treats weekends and holidays as non-business days", () => {
    expect(isBusinessDay("2026-10-09")).toBe(true) // Fri
    expect(isBusinessDay("2026-10-10")).toBe(false) // Sat
    expect(isBusinessDay("2026-10-12")).toBe(false) // スポーツの日
    expect(isBusinessDay("2026-10-13")).toBe(true)
  })

  it("adds business days forward and backward", () => {
    expect(addBusinessDays("2026-10-09", 1)).toBe("2026-10-13")
    expect(addBusinessDays("2026-10-13", -1)).toBe("2026-10-09")
    expect(addBusinessDays("2026-10-09", 0)).toBe("2026-10-09")
    expect(addBusinessDays("2026-10-09", 5)).toBe("2026-10-19")
  })

  it("counts and spans business days inclusively", () => {
    expect(businessDaysBetween("2026-10-09", "2026-10-13")).toBe(2)
    expect(businessDaysBetween("2026-10-13", "2026-10-09")).toBe(0)
    expect(nextBusinessDay("2026-10-10")).toBe("2026-10-13")
    expect(endOfBusinessSpan("2026-10-13", 1)).toBe("2026-10-13")
    expect(endOfBusinessSpan("2026-10-13", 5)).toBe("2026-10-19")
    expect(endOfBusinessSpan("2026-10-10", 2)).toBe("2026-10-14")
  })
})
