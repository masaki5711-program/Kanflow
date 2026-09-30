"use client"

import { Flag } from "lucide-react"
import { cn } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { HEADER_HEIGHT, type CalendarEvent, type DateColumn, type GanttText } from "./gantt-types"
import { daysBetween, eventFlagColor, startOfDay } from "./gantt-utils"

const MONTH_ROW_HEIGHT = 28
const DAY_ROW_HEIGHT = 36

interface GanttTimelineHeaderProps {
  columns: DateColumn[]
  events: CalendarEvent[]
  dayWidth: number
  timelineStart: Date
  todayTime: number
  text: GanttText
}

export function GanttTimelineHeader({ columns, events, dayWidth, timelineStart, todayTime, text }: GanttTimelineHeaderProps) {
  const { t } = useLanguage()
  const totalDays = columns.length

  return (
    <div className="sticky top-0 z-30 border-b border-border" style={{ height: HEADER_HEIGHT }}>
      <div className="relative flex" style={{ height: MONTH_ROW_HEIGHT }}>
        {columns.map((col, i) =>
          col.showMonth ? (
            <div
              key={`m-${col.id}`}
              className={cn(
                "absolute flex items-center px-2 text-caption font-semibold tracking-wide border-l border-border overflow-hidden whitespace-nowrap",
                col.date.getMonth() % 2 === 0 ? "bg-surface text-fg-muted" : "bg-surface-muted text-fg-muted",
              )}
              style={{ left: i * dayWidth, width: col.monthSpan * dayWidth, height: MONTH_ROW_HEIGHT }}
            >
              {col.monthYear}
            </div>
          ) : null,
        )}

        <ul aria-label={t.ganttEvents}>
          {events.map((evt) => {
            const offset = daysBetween(timelineStart, startOfDay(new Date(evt.date)))
            if (offset < 0 || offset >= totalDays) return null
            const title = text.eventTitle(evt)
            return (
              <li
                key={evt.id}
                className={cn("absolute z-10", eventFlagColor(evt.color))}
                style={{ left: offset * dayWidth + dayWidth / 2 - 6, top: 2 }}
                title={title}
              >
                <Flag aria-hidden="true" className="h-3.5 w-3.5" fill="currentColor" fillOpacity={0.3} />
                <span className="sr-only">{title}</span>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="flex" style={{ height: DAY_ROW_HEIGHT }} aria-hidden="true">
        {columns.map((col) => {
          const isToday = col.date.getTime() === todayTime
          return (
            <div
              key={`d-${col.id}`}
              className={cn(
                "flex flex-col items-center justify-center shrink-0 text-caption border-l",
                isToday
                  ? "bg-primary-soft text-primary-strong font-bold border-primary/30"
                  : col.isWeekendDay
                    ? "bg-surface-sunken text-fg-subtle border-border"
                    : "bg-surface text-fg-muted border-border",
              )}
              style={{ width: dayWidth }}
            >
              <span className="leading-none">{col.weekday}</span>
              <span className="leading-none mt-0.5">{col.dayNum}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
