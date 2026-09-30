"use client"

import { useMemo, useCallback, useEffect, useState } from "react"
import {
  CalendarEvent,
  toDateStr,
  isSameDay,
  eventColorBorder,
  eventColorDot,
  eventCoversDay,
  fmt,
  i18nOf,
} from "./calendar-types"
import { useLanguage } from "@/lib/language-context"
import { pickText } from "@/lib/translation/pick-text"

interface WeekViewProps {
  weekStart: Date
  events: CalendarEvent[]
  weekdays: string[]
  locale: string
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
  locale,
  onEventClick,
  onSlotClick,
}: WeekViewProps) {
  const today = useMemo(() => new Date(), [])
  const { t, language } = useLanguage()
  // Viewer-locale side of the event text (API rows carry `i18n`).
  const pick = (ev: CalendarEvent, field: "title" | "description") =>
    pickText(i18nOf(ev), field, ev[field], language).text

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
      return events.filter((ev) => eventCoversDay(ev, dayStr))
    },
    [events]
  )

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Day headers */}
      <div className="flex border-b border-border shrink-0 bg-surface shadow-ui-sm">
        {/* Time gutter */}
        <div className="w-16 shrink-0 border-r border-border" />
        {weekDays.map((day) => {
          const isToday = isSameDay(day, today)
          const isWeekend = day.getDay() === 0 || day.getDay() === 6
          const dayStr = toDateStr(day)
          const fullDate = day.toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric", weekday: "short" })
          return (
            <button
              key={dayStr}
              type="button"
              onClick={() => onSlotClick(dayStr)}
              aria-label={fmt(t.calendarAddOnDate, { date: fullDate })}
              className={`flex-1 text-center py-3 border-l border-border hover:bg-surface-muted ${
                isToday ? "bg-primary-soft/60" : ""
              }`}
            >
              <span
                className={`block text-caption font-bold uppercase tracking-widest ${
                  isWeekend ? "text-fg-subtle" : "text-fg-muted"
                }`}
              >
                {weekdays[day.getDay()]}
              </span>
              <span className="block mt-0.5">
                {isToday ? (
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-fg text-sm font-bold shadow-ui-sm">
                    {day.getDate()}
                  </span>
                ) : (
                  <span className="text-lg font-bold text-fg">
                    {day.getDate()}
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>

      {/* Time grid */}
      <div className="flex flex-1 min-h-0 overflow-auto">
        {/* Hour labels */}
        <div className="w-16 shrink-0 border-r border-border" aria-hidden>
          {hours.map((h) => (
            <div
              key={h}
              className="border-b border-surface-sunken text-right pr-3 text-caption text-fg-subtle font-medium"
              style={{ height: HOUR_HEIGHT }}
            >
              <span className="relative -top-2.5">
                {String(h).padStart(2, "0")}:00
              </span>
            </div>
          ))}
        </div>

        {/* Day columns */}
        {weekDays.map((day) => {
          const dayEvents = eventsForDay(day)
          const isToday = isSameDay(day, today)
          const isWeekend = day.getDay() === 0 || day.getDay() === 6
          const dayStr = toDateStr(day)

          return (
            <div
              key={dayStr}
              className={`flex-1 relative border-l border-border ${
                isToday ? "bg-primary-soft/20" : isWeekend ? "bg-surface-muted/60" : ""
              }`}
            >
              {/* Hour grid lines - alternating */}
              {hours.map((h, hi) => (
                <div
                  key={h}
                  aria-hidden
                  className={`border-b cursor-pointer ${
                    hi % 2 === 0 ? "border-border bg-transparent" : "border-surface-sunken bg-surface-muted/40"
                  } hover:bg-primary-soft/40`}
                  style={{ height: HOUR_HEIGHT }}
                  onClick={() => onSlotClick(dayStr)}
                >
                  {/* Half-hour line */}
                  <div
                    className="border-b border-surface-sunken border-dashed"
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
                      } bg-surface shadow-ui-sm`}
                      style={{ top: Math.max(top, 0), height }}
                      title={pick(ev, "title")}
                    >
                      <div className="px-2 py-1">
                        <div className="flex items-center gap-1">
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              eventColorDot[ev.color] ?? "bg-gray-500"
                            }`}
                          />
                          <span className="text-caption font-semibold text-fg truncate">
                            {pick(ev, "title")}
                          </span>
                        </div>
                        {height > 36 && ev.description && (
                          <p className="text-caption text-fg-muted truncate mt-0.5 ml-2.5">
                            {pick(ev, "description")}
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
        <div className="w-3 h-3 rounded-full bg-danger -ml-1.5 ring-2 ring-danger-soft" />
        <div className="flex-1 h-[2px] bg-danger" />
      </div>
    </div>
  )
}
