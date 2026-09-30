"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { toDateStr } from "./calendar-types"

/**
 * Keyboard model of the month grid (WAI-ARIA grid / date-picker pattern):
 *   ←/→ one day · ↑/↓ one week · Home/End start / end of the week ·
 *   PageUp/PageDown previous / next month (Shift: year).
 * Returns the date to move to, or null when the key is not a grid key.
 */
export function gridKeyTarget(key: string, date: Date, shiftKey = false): Date | null {
  const y = date.getFullYear()
  const m = date.getMonth()
  const d = date.getDate()
  const shiftMonths = (delta: number) => {
    const last = new Date(y, m + delta + 1, 0).getDate()
    return new Date(y, m + delta, Math.min(d, last))
  }
  switch (key) {
    case "ArrowLeft":
      return new Date(y, m, d - 1)
    case "ArrowRight":
      return new Date(y, m, d + 1)
    case "ArrowUp":
      return new Date(y, m, d - 7)
    case "ArrowDown":
      return new Date(y, m, d + 7)
    case "Home":
      return new Date(y, m, d - date.getDay())
    case "End":
      return new Date(y, m, d + (6 - date.getDay()))
    case "PageUp":
      return shiftMonths(shiftKey ? -12 : -1)
    case "PageDown":
      return shiftMonths(shiftKey ? 12 : 1)
    default:
      return null
  }
}

const DAY_ATTR = "data-cal-day"

/** The day that holds the grid's single Tab stop when none was focused yet: today in its month, else the 1st. */
export function defaultFocusDay(year: number, month: number, today: Date): string {
  return today.getFullYear() === year && today.getMonth() === month ? toDateStr(today) : toDateStr(new Date(year, month, 1))
}

/**
 * Roving tabindex for the month grid: one Tab stop (the focused / default
 * day); arrow keys move it, leaving the shown weeks switches the month.
 */
export function useMonthGridFocus(opts: {
  calendarDays: readonly Date[]
  currentYear: number
  currentMonth: number
  today: Date
  onShowMonth: (date: Date) => void
}) {
  const { calendarDays, currentYear, currentMonth, today, onShowMonth } = opts
  const gridRef = useRef<HTMLDivElement>(null)
  const [focusDay, setFocusDay] = useState<string | null>(null)
  const pendingFocus = useRef(false)
  const shown = useMemo(() => calendarDays.map(toDateStr), [calendarDays])
  const tabStop = focusDay && shown.includes(focusDay) ? focusDay : defaultFocusDay(currentYear, currentMonth, today)

  useEffect(() => {
    if (!pendingFocus.current) return
    const btn = gridRef.current?.querySelector<HTMLElement>(`[${DAY_ATTR}="${tabStop}"]`)
    if (!btn) return
    pendingFocus.current = false
    btn.focus()
  }, [tabStop, calendarDays])

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      const from = (e.target as HTMLElement).getAttribute?.(DAY_ATTR)
      if (!from) return
      const [y, m, d] = from.split("-").map(Number)
      const target = gridKeyTarget(e.key, new Date(y, m - 1, d), e.shiftKey)
      if (!target) return
      e.preventDefault()
      const key = toDateStr(target)
      pendingFocus.current = true
      setFocusDay(key)
      const isPaging = e.key === "PageUp" || e.key === "PageDown"
      if (isPaging || !shown.includes(key)) onShowMonth(target)
    },
    [onShowMonth, shown],
  )

  return { gridRef, tabStop, onKeyDown, onDayFocus: setFocusDay }
}
