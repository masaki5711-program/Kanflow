"use client"

import { useMemo } from "react"
import { cn } from "@/components/ui"
import {
  CalendarEvent,
  toDateStr,
  isSameDay,
  parseLocalDate,
  buildCalendarDays,
  datePart,
  eventColorDot,
} from "./calendar-types"

const MAX_DOTS_PER_DAY = 3

interface MiniCalendarProps {
  currentYear: number
  currentMonth: number
  today: Date
  events: CalendarEvent[]
  weekdays: string[]
  locale: string
  onDateClick: (d: Date) => void
}

interface DayDot {
  id: string
  color: string
}

export default function MiniCalendar({
  currentYear,
  currentMonth,
  today,
  events,
  weekdays,
  locale,
  onDateClick,
}: MiniCalendarProps) {
  const month1Days = useMemo(() => buildCalendarDays(currentYear, currentMonth), [currentYear, currentMonth])

  const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1
  const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear

  const month2Days = useMemo(() => buildCalendarDays(nextYear, nextMonth), [nextYear, nextMonth])

  const monthLabel = (y: number, m: number) =>
    new Date(y, m, 1).toLocaleDateString(locale, { year: "numeric", month: "short" })

  // Event dots per day (max 3), keyed by event id for stable rendering.
  const eventDotsMap = useMemo(() => {
    const map: Record<string, DayDot[]> = {}
    for (const ev of events) {
      const start = datePart(ev.date)
      const end = ev.endDate ? datePart(ev.endDate) : start
      let d = parseLocalDate(start)
      const endD = parseLocalDate(end)
      while (d <= endD) {
        const key = toDateStr(d)
        const dots = map[key] ?? []
        if (dots.length < MAX_DOTS_PER_DAY) map[key] = [...dots, { id: ev.id, color: ev.color }]
        d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
      }
    }
    return map
  }, [events])

  return (
    <div className="w-56 border-l border-border bg-surface-muted/40 p-4 shrink-0 overflow-auto hidden lg:block space-y-5">
      <MiniMonthGrid
        label={monthLabel(currentYear, currentMonth)}
        days={month1Days}
        month={currentMonth}
        today={today}
        locale={locale}
        eventDotsMap={eventDotsMap}
        weekdays={weekdays}
        onDateClick={onDateClick}
      />
      <MiniMonthGrid
        label={monthLabel(nextYear, nextMonth)}
        days={month2Days}
        month={nextMonth}
        today={today}
        locale={locale}
        eventDotsMap={eventDotsMap}
        weekdays={weekdays}
        onDateClick={onDateClick}
      />
    </div>
  )
}

function MiniMonthGrid({
  label,
  days,
  month,
  today,
  locale,
  eventDotsMap,
  weekdays,
  onDateClick,
}: {
  label: string
  days: Date[]
  month: number
  today: Date
  locale: string
  eventDotsMap: Record<string, DayDot[]>
  weekdays: string[]
  onDateClick: (d: Date) => void
}) {
  return (
    <div>
      <h2 className="text-caption font-bold text-fg mb-2 text-center tracking-wide">{label}</h2>
      <div className="grid grid-cols-7 gap-0">
        {weekdays.map((wd) => (
          <div key={wd} className="text-caption text-center text-fg-subtle font-semibold pb-1 uppercase" aria-hidden>
            {wd.slice(0, 2)}
          </div>
        ))}
        {days.map((day) => {
          const isCurrentMonth = day.getMonth() === month
          const isToday = isSameDay(day, today)
          const dayStr = toDateStr(day)
          const dots = eventDotsMap[dayStr] ?? []

          return (
            <button
              key={dayStr}
              type="button"
              onClick={() => onDateClick(day)}
              aria-label={day.toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" })}
              aria-current={isToday ? "date" : undefined}
              className={cn(
                "text-caption w-7 h-7 flex flex-col items-center justify-center rounded-ui-sm",
                isToday
                  ? "bg-primary text-primary-fg font-bold shadow-ui-sm"
                  : isCurrentMonth
                    ? "text-fg hover:bg-primary-soft"
                    : "text-fg-subtle",
              )}
            >
              <span>{day.getDate()}</span>
              {dots.length > 0 && !isToday && (
                <span className="flex gap-px -mt-0.5" aria-hidden>
                  {dots.map((dot) => (
                    <span key={dot.id} className={cn("block w-1 h-1 rounded-full", eventColorDot[dot.color] ?? "bg-fg-subtle")} />
                  ))}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
