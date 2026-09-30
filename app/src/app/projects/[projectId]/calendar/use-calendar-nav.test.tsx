import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { toDateStr } from "./calendar-types"
import { useCalendarNav } from "./use-calendar-nav"

describe("useCalendarNav", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(2026, 8, 16, 10))
  })
  afterEach(() => vi.useRealTimers())

  it("moves by month in month view and returns to today", () => {
    const { result } = renderHook(() => useCalendarNav(new Date(2026, 8, 16), "en"))
    expect(result.current.locale).toBe("en-US")
    expect(result.current.periodLabel).toBe("September 2026")
    act(() => result.current.goNext())
    expect(result.current.currentMonth).toBe(9)
    act(() => result.current.goPrev())
    act(() => result.current.goPrev())
    expect(result.current.currentMonth).toBe(7)
    act(() => result.current.goToday())
    expect(result.current.currentMonth).toBe(8)
  })

  it("moves by week in week view and keeps the month in sync", () => {
    const { result } = renderHook(() => useCalendarNav(new Date(2026, 8, 30), "xx"))
    expect(result.current.locale).toBe("default")
    act(() => result.current.setViewMode("week"))
    expect(toDateStr(result.current.currentWeekStart)).toBe("2026-09-27")
    expect(result.current.periodLabel).toContain(" - ")
    act(() => result.current.goNext())
    expect(toDateStr(result.current.currentWeekStart)).toBe("2026-10-04")
    expect(result.current.currentMonth).toBe(9)
    act(() => result.current.goPrev())
    expect(toDateStr(result.current.currentWeekStart)).toBe("2026-09-27")
    act(() => result.current.showMonthOf(new Date(2027, 0, 3)))
    expect([result.current.currentYear, result.current.currentMonth]).toEqual([2027, 0])
  })
})
