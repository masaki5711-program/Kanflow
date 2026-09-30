"use client"

import { memo } from "react"
import { cn } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { ROW_HEIGHT, type DateColumn, type GanttRow, type GanttText } from "./gantt-types"
import {
  daysBetween,
  formatDate,
  localeOf,
  pbiDonePercent,
  sprintDonePercent,
  sprintGradient,
  startOfDay,
  taskBarColor,
  taskBarRange,
} from "./gantt-utils"

interface GanttTimelineBodyProps {
  rows: GanttRow[]
  columns: DateColumn[]
  dayWidth: number
  timelineStart: Date
  todayTime: number
  hoveredRow: string | null
  onHover: (key: string | null) => void
  text: GanttText
}

export function GanttTimelineBody({
  rows,
  columns,
  dayWidth,
  timelineStart,
  todayTime,
  hoveredRow,
  onHover,
  text,
}: GanttTimelineBodyProps) {
  const todayOffset = daysBetween(timelineStart, new Date(todayTime))
  const showToday = todayOffset >= 0 && todayOffset < columns.length

  return (
    <div style={{ height: rows.length * ROW_HEIGHT }} className="relative">
      <div aria-hidden="true">
        {columns.map((col, i) => {
          const isToday = col.date.getTime() === todayTime
          return (
            <div
              key={`grid-${col.id}`}
              className={cn(
                "absolute top-0 bottom-0 border-l",
                isToday
                  ? "bg-primary-soft/40 border-primary/30"
                  : col.isWeekendDay
                    ? "bg-surface-muted border-border"
                    : "border-border/60",
              )}
              style={{ left: i * dayWidth, width: dayWidth }}
            />
          )
        })}

        {rows.map((row, idx) => (
          <div
            key={`stripe-${row.key}`}
            className={cn("absolute w-full border-b border-border", hoveredRow === row.key && "bg-primary-soft/40")}
            style={{ top: idx * ROW_HEIGHT, height: ROW_HEIGHT }}
            onMouseEnter={() => onHover(row.key)}
            onMouseLeave={() => onHover(null)}
          />
        ))}

        {showToday && (
          <>
            <div className="absolute z-20" style={{ left: todayOffset * dayWidth + dayWidth / 2 - 5, top: -4 }}>
              <div className="w-2.5 h-2.5 rounded-full bg-danger ring-2 ring-danger-soft" />
            </div>
            <div
              className="absolute top-0 bottom-0 z-20 border-l-2 border-dashed border-danger"
              style={{ left: todayOffset * dayWidth + dayWidth / 2 }}
            />
          </>
        )}
      </div>

      {rows.map((row, idx) => (
        <GanttBar
          key={`bar-${row.key}`}
          row={row}
          top={idx * ROW_HEIGHT}
          dayWidth={dayWidth}
          timelineStart={timelineStart}
          text={text}
        />
      ))}
    </div>
  )
}

interface GanttBarProps {
  row: GanttRow
  top: number
  dayWidth: number
  timelineStart: Date
  text: GanttText
}

/** Memoized so row-hover state changes in the parent never re-render the bars. */
const GanttBar = memo(function GanttBar({ row, top, dayWidth, timelineStart, text }: GanttBarProps) {
  const { t, language } = useLanguage()
  const locale = localeOf(language)

  const pos = (start: Date, end: Date, inset: number, minWidth: number) => ({
    left: daysBetween(timelineStart, start) * dayWidth,
    width: Math.max((daysBetween(start, end) + 1) * dayWidth - inset, minWidth),
  })
  const period = (start: Date, end: Date) => `${t.ganttPeriod}: ${formatDate(start, locale)} – ${formatDate(end, locale)}`
  const done = (pct: number) => t.ganttPercentDone.replace("{pct}", String(pct))

  if (row.kind === "task") {
    const { start, end } = taskBarRange(row.sprint, row.taskIndex, row.pbiTasks.length)
    const { left, width } = pos(start, end, 8, 12)
    const { task } = row
    const hours =
      task.estimatedHours
        ? t.ganttHours.replace("{actual}", String(task.actualHours ?? 0)).replace("{estimated}", String(task.estimatedHours))
        : null
    const label = [text.taskName(task), text.taskStatusLabel(task.status), task.assignee, hours, period(start, end)]
      .filter(Boolean)
      .join(" | ")
    return (
      <div
        role="img"
        aria-label={label}
        title={label}
        className={cn("absolute rounded-full opacity-80", taskBarColor(task.status))}
        style={{ left: left + 4, top: top + 16, width, height: 8 }}
      />
    )
  }

  const start = startOfDay(new Date(row.sprint.startDate))
  const end = startOfDay(new Date(row.sprint.endDate))
  const { left, width } = pos(start, end, 4, 8)

  if (row.kind === "pbi") {
    const pct = pbiDonePercent(row.tasks)
    const label = `#${row.pbi.displayId} ${text.pbiLabel(row.pbi)} | ${done(pct)}`
    return (
      <div
        role="img"
        aria-label={label}
        title={label}
        className="absolute rounded bg-indigo-200/70 overflow-hidden"
        style={{ left: left + 4, top: top + 14, width: width - 4, height: 12 }}
      >
        <div className="absolute inset-y-0 left-0 bg-indigo-400/50 rounded-l" style={{ width: `${pct}%` }} />
      </div>
    )
  }

  const pct = sprintDonePercent(row.sprint)
  const name = text.sprintName(row.sprint)
  const label = `${name} | ${text.statusLabel(row.sprint.status)} | ${done(pct)} | ${period(start, end)}`
  return (
    <div
      role="img"
      aria-label={label}
      title={label}
      className={cn("absolute rounded-md overflow-hidden bg-gradient-to-r shadow-ui-sm", sprintGradient(row.sprint.status))}
      style={{ left: left + 2, top: top + 10, width, height: 20 }}
    >
      <div className="absolute inset-y-0 left-0 bg-black/10 rounded-l-md" style={{ width: `${pct}%` }} />
      <span aria-hidden="true" className="relative text-caption text-white font-semibold px-2 truncate block leading-[20px] drop-shadow-sm">
        {name}
      </span>
    </div>
  )
})
