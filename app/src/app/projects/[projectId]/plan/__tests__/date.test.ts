import { describe, expect, it } from "vitest"
import {
  addDays,
  clampDay,
  dayParts,
  dayToYmd,
  diffDays,
  isoWeekStartDay,
  isWeekendDay,
  isYmd,
  localTodayYmd,
  monthStartDay,
  nextMonthStartDay,
  quarterStartDay,
  spanDays,
  toYmd,
  weekdayOfDay,
  yearStartDay,
  ymdToDay,
} from "../lib/date"
import { formatFullDate, formatMonthDay, formatMonthYear, formatShortDate, formatYear, weekdayInitial } from "../lib/date-format"

describe("date model (UTC day numbers)", () => {
  it("round-trips YYYY-MM-DD through day numbers", () => {
    expect(ymdToDay("1970-01-01")).toBe(0)
    expect(dayToYmd(ymdToDay("2026-10-01"))).toBe("2026-10-01")
  })

  it("normalises ISO timestamps and rejects invalid dates", () => {
    expect(toYmd("2026-03-10T00:00:00.000Z")).toBe("2026-03-10")
    expect(toYmd("2026-02-30")).toBeNull()
    expect(toYmd("")).toBeNull()
    expect(toYmd(null)).toBeNull()
    expect(toYmd("nope")).toBeNull()
    expect(isYmd("2026-10-01")).toBe(true)
    expect(isYmd("2026-10-01T00:00")).toBe(false)
    expect(isYmd(5)).toBe(false)
    expect(() => ymdToDay("x")).toThrow(RangeError)
  })

  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01")
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01")
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28")
  })

  it("handles leap years", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29")
    expect(addDays("2028-02-29", 1)).toBe("2028-03-01")
    expect(diffDays("2028-02-01", "2028-03-01")).toBe(29)
    expect(diffDays("2026-02-01", "2026-03-01")).toBe(28)
  })

  it("spanDays is end-inclusive", () => {
    expect(spanDays("2026-10-01", "2026-10-01")).toBe(1)
    expect(spanDays("2026-10-03", "2026-10-12")).toBe(10)
  })

  it("weekday, weekend and ISO week start", () => {
    const thu = ymdToDay("2026-10-01")
    expect(weekdayOfDay(thu)).toBe(4)
    expect(weekdayOfDay(-1)).toBe(3)
    expect(isWeekendDay(ymdToDay("2026-10-03"))).toBe(true)
    expect(isWeekendDay(ymdToDay("2026-10-04"))).toBe(true)
    expect(isWeekendDay(thu)).toBe(false)
    expect(dayToYmd(isoWeekStartDay(thu))).toBe("2026-09-28")
    expect(dayToYmd(isoWeekStartDay(ymdToDay("2026-10-04")))).toBe("2026-09-28")
    expect(dayToYmd(isoWeekStartDay(ymdToDay("2026-10-05")))).toBe("2026-10-05")
  })

  it("month / quarter / year starts", () => {
    const d = ymdToDay("2026-11-17")
    expect(dayToYmd(monthStartDay(d))).toBe("2026-11-01")
    expect(dayToYmd(nextMonthStartDay(d))).toBe("2026-12-01")
    expect(dayToYmd(nextMonthStartDay(ymdToDay("2026-12-05")))).toBe("2027-01-01")
    expect(dayToYmd(quarterStartDay(d))).toBe("2026-10-01")
    expect(dayToYmd(yearStartDay(d))).toBe("2026-01-01")
    expect(dayParts(d)).toEqual({ year: 2026, month: 11, day: 17 })
    expect(clampDay(5, 0, 3)).toBe(3)
    expect(clampDay(-5, 0, 3)).toBe(0)
  })

  it("localTodayYmd formats a YYYY-MM-DD", () => {
    expect(localTodayYmd(new Date(2026, 9, 1, 12))).toBe("2026-10-01")
  })
})

describe("localized date labels", () => {
  it("short dates per language", () => {
    expect(formatShortDate("2026-10-01", "ja")).toBe("10/01(木)")
    expect(formatShortDate("2026-10-01", "en")).toBe("Oct 1 (Thu)")
    expect(formatShortDate("2026-10-01", "id")).toBe("1 Okt (Kam)")
  })

  it("month-day, month-year, year, weekday initial and full date", () => {
    const d = ymdToDay("2026-10-06")
    expect(formatMonthDay(d, "ja")).toBe("10/6")
    expect(formatMonthDay(d, "en")).toBe("Oct 6")
    expect(formatMonthDay(d, "id")).toBe("6 Okt")
    expect(formatMonthYear(d, "ja")).toBe("2026年10月")
    expect(formatMonthYear(d, "en")).toBe("October 2026")
    expect(formatYear(d, "ja")).toBe("2026年")
    expect(weekdayInitial(d, "en")).toBe("T")
    expect(formatFullDate("2026-10-01", "en")).toBe("Thursday, October 1, 2026")
  })
})
