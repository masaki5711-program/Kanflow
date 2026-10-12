import { describe, expect, it } from "vitest"
import { parseDateInput } from "../lib/date-input"

// 2026-10-14 is a Wednesday.
const TODAY = "2026-10-14"
const p = (s: string) => parseDateInput(s, TODAY)

describe("parseDateInput", () => {
  it("reads absolute dates in several spellings", () => {
    expect(p("2026-11-02")).toBe("2026-11-02")
    expect(p("2026/11/2")).toBe("2026-11-02")
    expect(p("20261102")).toBe("2026-11-02")
    expect(p("2026年11月2日")).toBe("2026-11-02")
    expect(p("２０２６／１１／２")).toBe("2026-11-02")
  })

  it("infers the year of month/day and rejects impossible dates", () => {
    expect(p("10/20")).toBe("2026-10-20")
    expect(p("11月5日")).toBe("2026-11-05")
    expect(p("1/5")).toBe("2027-01-05") // > 6 months in the past → next year
    expect(p("2/30")).toBeNull()
    expect(p("2026-02-30")).toBeNull()
  })

  it("reads relative offsets", () => {
    expect(p("+3d")).toBe("2026-10-17")
    expect(p("+2w")).toBe("2026-10-28")
    expect(p("-1w")).toBe("2026-10-07")
    expect(p("+1m")).toBe("2026-11-14")
    expect(p("+1y")).toBe("2027-10-14")
    expect(p("+3bd")).toBe("2026-10-19")
    expect(p("3日後")).toBe("2026-10-17")
    expect(p("2週間後")).toBe("2026-10-28")
    expect(p("1ヶ月後")).toBe("2026-11-14")
    expect(p("5営業日後")).toBe("2026-10-21")
  })

  it("reads named days and months", () => {
    expect(p("今日")).toBe(TODAY)
    expect(p("明日")).toBe("2026-10-15")
    expect(p("明後日")).toBe("2026-10-16")
    expect(p("月末")).toBe("2026-10-31")
    expect(p("来月末")).toBe("2026-11-30")
    expect(p("来月")).toBe("2026-11-01")
    expect(p("来月15日")).toBe("2026-11-15")
    expect(p("25日")).toBe("2026-10-25")
  })

  it("reads weekdays (bare = next one, 今週/来週 = inside that week)", () => {
    expect(p("金曜")).toBe("2026-10-16")
    expect(p("水曜")).toBe("2026-10-21") // strictly after today
    expect(p("今週金曜")).toBe("2026-10-16")
    expect(p("来週金曜")).toBe("2026-10-23")
    expect(p("再来週月曜")).toBe("2026-10-26")
    expect(p("next fri")).toBe("2026-10-23")
    expect(p("fri")).toBe("2026-10-16")
  })

  it("reads Excel's weekday suffix and US order", () => {
    expect(p("10/20(火)")).toBe("2026-10-20")
    expect(p("2026/10/20（火）")).toBe("2026-10-20")
    expect(p("10/20/2026")).toBe("2026-10-20")
  })

  it("returns null for anything it does not understand", () => {
    expect(p("")).toBeNull()
    expect(p("いつか")).toBeNull()
    expect(p("++")).toBeNull()
  })
})
