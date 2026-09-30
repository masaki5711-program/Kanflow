"use client"

import { useMemo, useState } from "react"
import { type ViewMode, getWeekStart } from "./calendar-types"

const LOCALE_BY_LANG: Record<string, string> = { ja: "ja-JP", en: "en-US", id: "id-ID" }

/** Month / week navigation state for the calendar page. */
export function useCalendarNav(today: Date, language: string) {
  const [viewMode, setViewMode] = useState<ViewMode>("month")
  const [currentYear, setCurrentYear] = useState(today.getFullYear())
  const [currentMonth, setCurrentMonth] = useState(today.getMonth())
  const [currentWeekStart, setCurrentWeekStart] = useState(() => getWeekStart(today))
  const locale = LOCALE_BY_LANG[language] ?? "default"

  function showMonthOf(d: Date) {
    setCurrentYear(d.getFullYear())
    setCurrentMonth(d.getMonth())
  }

  function shiftMonth(delta: number) {
    showMonthOf(new Date(currentYear, currentMonth + delta, 1))
  }

  function shiftWeek(delta: number) {
    const ws = currentWeekStart
    const next = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + delta * 7)
    setCurrentWeekStart(next)
    showMonthOf(next)
  }

  function goToday() {
    const now = new Date()
    showMonthOf(now)
    setCurrentWeekStart(getWeekStart(now))
  }

  const goPrev = () => (viewMode === "week" ? shiftWeek(-1) : shiftMonth(-1))
  const goNext = () => (viewMode === "week" ? shiftWeek(1) : shiftMonth(1))

  const periodLabel = useMemo(() => {
    if (viewMode === "week") {
      const ws = currentWeekStart
      const endOfWeek = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + 6)
      const startLabel = ws.toLocaleDateString(locale, { month: "short", day: "numeric" })
      const endLabel = endOfWeek.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" })
      return `${startLabel} - ${endLabel}`
    }
    return new Date(currentYear, currentMonth, 1).toLocaleDateString(locale, { year: "numeric", month: "long" })
  }, [currentYear, currentMonth, viewMode, currentWeekStart, locale])

  return {
    viewMode,
    setViewMode,
    currentYear,
    currentMonth,
    currentWeekStart,
    locale,
    periodLabel,
    goPrev,
    goNext,
    goToday,
    showMonthOf,
  }
}
