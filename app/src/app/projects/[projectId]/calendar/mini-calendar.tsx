"use client"

import { useMemo } from "react"
import {
  CalendarEvent,
  toDateStr,
  isSameDay,
  parseLocalDate,
  buildCalendarDays,
  eventColorDot,
} from "./calendar-types"

interface MiniCalendarProps {
  currentYear: number
  currentMonth: number
  today: Date
  events: CalendarEvent[]
  weekdays: string[]
  onDateClick: (d: Date) => void
}

export default function MiniCalendar({
  currentYear,
  currentMonth,
  today,
  events,
  weekdays,
  onDateClick,
}: MiniCalendarProps) {
  const month1Days = useMemo(
    () => buildCalendarDays(currentYear, currentMonth),
    [currentYear, currentMonth]
  )

  const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1
  const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear

  const month2Days = useMemo(
    () => buildCalendarDays(nextYear, nextMonth),
    [nextYear, nextMonth]
  )

  const month1Label = useMemo(() => {
    return new Date(currentYear, currentMonth, 1).toLocaleDateString("default", {
      year: "numeric",
      month: "short",
    })
  }, [currentYear, currentMonth])

  const month2Label = useMemo(() => {
    return new Date(nextYear, nextMonth, 1).toLocaleDateString("default", {
      year: "numeric",
      month: "short",
    })
  }, [nextYear, nextMonth])

  // Build event dots map with colors
  const eventDotsMap = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const ev of events) {
      const start = ev.date.split("T")[0]
      const end = ev.endDate ? ev.endDate.split("T")[0] : start
      let d = parseLocalDate(start)
      const endD = parseLocalDate(end)
      while (d <= endD) {
        const key = toDateStr(d)
        if (!map[key]) map[key] = []
        if (map[key].length < 3) {
          map[key].push(ev.color)
        }
        d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
      }
    }
    return map
  }, [events])

  return (
    <div className="w-56 border-l bg-gray-50/30 p-4 shrink-0 overflow-auto hidden lg:block space-y-5">
      <MiniMonthGrid
        label={month1Label}
        days={month1Days}
        month={currentMonth}
        today={today}
        eventDotsMap={eventDotsMap}
        weekdays={weekdays}
        onDateClick={onDateClick}
      />
      <MiniMonthGrid
        label={month2Label}
        days={month2Days}
        month={nextMonth}
        today={today}
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
  eventDotsMap,
  weekdays,
  onDateClick,
}: {
  label: string
  days: Date[]
  month: number
  today: Date
  eventDotsMap: Record<string, string[]>
  weekdays: string[]
  onDateClick: (d: Date) => void
}) {
  return (
    <div>
      <div className="text-xs font-bold text-gray-700 mb-2 text-center tracking-wide">
        {label}
      </div>
      <div className="grid grid-cols-7 gap-0">
        {weekdays.map((wd, i) => (
          <div
            key={i}
            className="text-[9px] text-center text-gray-400 font-semibold pb-1 uppercase"
          >
            {wd.slice(0, 2)}
          </div>
        ))}
        {days.map((day, i) => {
          const isCurrentMonth = day.getMonth() === month
          const isToday = isSameDay(day, today)
          const dayStr = toDateStr(day)
          const dotColors = eventDotsMap[dayStr] ?? []

          return (
            <button
              key={i}
              type="button"
              onClick={() => onDateClick(day)}
              className={`text-[10px] w-7 h-7 flex flex-col items-center justify-center rounded-lg transition-all ${
                isToday
                  ? "bg-blue-600 text-white font-bold shadow-sm shadow-blue-300"
                  : isCurrentMonth
                  ? "text-gray-700 hover:bg-blue-50"
                  : "text-gray-300"
              }`}
            >
              <span>{day.getDate()}</span>
              {dotColors.length > 0 && !isToday && (
                <span className="flex gap-px -mt-0.5">
                  {dotColors.map((color, ci) => (
                    <span
                      key={ci}
                      className={`block w-1 h-1 rounded-full ${eventColorDot[color] ?? "bg-gray-400"}`}
                    />
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
