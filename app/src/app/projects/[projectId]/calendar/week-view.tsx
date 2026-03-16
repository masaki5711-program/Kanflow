"use client"

import { useMemo, useCallback, useEffect, useState } from "react"
import {
  CalendarEvent,
  toDateStr,
  isSameDay,
  eventColorBorder,
  eventColorBg,
  eventColorDot,
} from "./calendar-types"

interface WeekViewProps {
  weekStart: Date
  events: CalendarEvent[]
  weekdays: string[]
  onEventClick: (ev: CalendarEvent) => void
  onSlotClick: (dateStr: string) => void
}

const HOUR_START = 6
const HOUR_END = 22
const HOUR_HEIGHT = 60

export default function WeekView({
  weekStart,
  events,
  weekdays,
  onEventClick,
  onSlotClick,
}: WeekViewProps) {
  const today = useMemo(() => new Date(), [])

  const weekDays = useMemo(() => {
    const days: Date[] = []
    for (let i = 0; i < 7; i++) {
      days.push(
        new Date(
          weekStart.getFullYear(),
          weekStart.getMonth(),
          weekStart.getDate() + i
        )
      )
    }
    return days
  }, [weekStart])

  const hours = useMemo(() => {
    const h: number[] = []
    for (let i = HOUR_START; i <= HOUR_END; i++) {
      h.push(i)
    }
    return h
  }, [])

  const eventsForDay = useCallback(
    (day: Date): CalendarEvent[] => {
      const dayStr = toDateStr(day)
      return events.filter((ev) => {
        const startStr = ev.date.split("T")[0]
        const endStr = ev.endDate ? ev.endDate.split("T")[0] : startStr
        return dayStr >= startStr && dayStr <= endStr
      })
    },
    [events]
  )

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Day headers */}
      <div className="flex border-b shrink-0 bg-white shadow-sm">
        {/* Time gutter */}
        <div className="w-16 shrink-0 border-r border-gray-100" />
        {weekDays.map((day, i) => {
          const isToday = isSameDay(day, today)
          const isWeekend = day.getDay() === 0 || day.getDay() === 6
          return (
            <div
              key={i}
              className={`flex-1 text-center py-3 border-l border-gray-100 ${
                isToday ? "bg-blue-50/60" : ""
              }`}
            >
              <div
                className={`text-[10px] font-bold uppercase tracking-widest ${
                  isWeekend ? "text-gray-400" : "text-gray-500"
                }`}
              >
                {weekdays[day.getDay()]}
              </div>
              <div className="mt-0.5">
                {isToday ? (
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-bold shadow-sm shadow-blue-200">
                    {day.getDate()}
                  </span>
                ) : (
                  <span className="text-lg font-bold text-gray-800">
                    {day.getDate()}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Time grid */}
      <div className="flex flex-1 min-h-0 overflow-auto">
        {/* Hour labels */}
        <div className="w-16 shrink-0 border-r border-gray-100">
          {hours.map((h, hi) => (
            <div
              key={h}
              className="border-b border-gray-50 text-right pr-3 text-xs text-gray-400 font-medium"
              style={{ height: HOUR_HEIGHT }}
            >
              <span className="relative -top-2.5">
                {String(h).padStart(2, "0")}:00
              </span>
            </div>
          ))}
        </div>

        {/* Day columns */}
        {weekDays.map((day, di) => {
          const dayEvents = eventsForDay(day)
          const isToday = isSameDay(day, today)
          const isWeekend = day.getDay() === 0 || day.getDay() === 6
          const dayStr = toDateStr(day)

          return (
            <div
              key={di}
              className={`flex-1 relative border-l border-gray-100 ${
                isToday ? "bg-blue-50/20" : isWeekend ? "bg-gray-50/30" : ""
              }`}
            >
              {/* Hour grid lines - alternating */}
              {hours.map((h, hi) => (
                <div
                  key={h}
                  className={`border-b cursor-pointer transition-colors ${
                    hi % 2 === 0 ? "border-gray-100 bg-transparent" : "border-gray-50 bg-gray-50/20"
                  } hover:bg-blue-50/40`}
                  style={{ height: HOUR_HEIGHT }}
                  onClick={() => onSlotClick(dayStr)}
                >
                  {/* Half-hour line */}
                  <div
                    className="border-b border-gray-50/80 border-dashed"
                    style={{ marginTop: HOUR_HEIGHT / 2 - 1 }}
                  />
                </div>
              ))}

              {/* Current time line */}
              {isToday && <CurrentTimeLine hourStart={HOUR_START} hourHeight={HOUR_HEIGHT} />}

              {/* Event blocks positioned by time */}
              <div className="absolute top-0 left-1 right-1 pointer-events-none">
                {dayEvents.map((ev, ei) => {
                  // Try to parse time from date, fallback to stacking at 9am
                  const startHour = parseEventHour(ev.date, 9 + ei * 1.5)
                  const endHour = ev.endDate
                    ? parseEventHour(ev.endDate, startHour + 1)
                    : startHour + 1
                  const top = (startHour - HOUR_START) * HOUR_HEIGHT
                  const height = Math.max((endHour - startHour) * HOUR_HEIGHT, 28)

                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onEventClick(ev)
                      }}
                      className={`absolute left-0 right-0 pointer-events-auto rounded-lg border-l-[3px] text-left overflow-hidden transition-shadow hover:shadow-md ${
                        eventColorBorder[ev.color] ?? "border-l-gray-500"
                      } bg-white shadow-sm`}
                      style={{ top: Math.max(top, 0), height }}
                      title={ev.title}
                    >
                      <div className="px-2 py-1">
                        <div className="flex items-center gap-1">
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              eventColorDot[ev.color] ?? "bg-gray-500"
                            }`}
                          />
                          <span className="text-[11px] font-semibold text-gray-800 truncate">
                            {ev.title}
                          </span>
                        </div>
                        {height > 36 && ev.description && (
                          <p className="text-[10px] text-gray-500 truncate mt-0.5 ml-2.5">
                            {ev.description}
                          </p>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function parseEventHour(dateStr: string, fallback: number): number {
  if (dateStr.includes("T")) {
    const timePart = dateStr.split("T")[1]
    if (timePart) {
      const [hStr, mStr] = timePart.split(":")
      const h = parseInt(hStr, 10)
      const m = parseInt(mStr ?? "0", 10)
      if (!isNaN(h)) return h + m / 60
    }
  }
  return fallback
}

function CurrentTimeLine({
  hourStart,
  hourHeight,
}: {
  hourStart: number
  hourHeight: number
}) {
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    function update() {
      const now = new Date()
      const currentHour = now.getHours()
      const currentMinute = now.getMinutes()
      setOffset((currentHour - hourStart + currentMinute / 60) * hourHeight)
    }
    update()
    const interval = setInterval(update, 60000)
    return () => clearInterval(interval)
  }, [hourStart, hourHeight])

  const maxOffset = (22 - hourStart) * hourHeight
  if (offset < 0 || offset > maxOffset) return null

  return (
    <div
      className="absolute left-0 right-0 z-20 pointer-events-none"
      style={{ top: offset }}
    >
      <div className="flex items-center">
        <div className="w-3 h-3 rounded-full bg-red-500 -ml-1.5 shadow-sm shadow-red-300 ring-2 ring-red-200/50" />
        <div className="flex-1 h-[2px] bg-red-500 shadow-sm shadow-red-300/50" />
      </div>
    </div>
  )
}
