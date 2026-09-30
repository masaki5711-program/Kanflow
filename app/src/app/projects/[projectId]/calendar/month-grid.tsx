"use client"

import { memo } from "react"
import { cn } from "@/components/ui"
import { useStableHandlers } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { pickText } from "@/lib/translation/pick-text"
import {
  type CalendarEvent,
  type DeadlineEntry,
  datePart,
  eventColorBorder,
  eventCoversDay,
  fmt,
  i18nOf,
  isSameDay,
  sprintGradient,
  sprintStatusColor,
  sprintTextColor,
  toDateStr,
} from "./calendar-types"
import type { SprintPhase } from "./use-calendar-data"
import { useMonthGridFocus } from "./use-month-grid-focus"

const MAX_VISIBLE_EVENTS = 3

export interface MonthGridProps {
  calendarDays: Date[]
  currentYear: number
  currentMonth: number
  /** Accessible name of the grid (the period label, e.g. "2026年10月"). */
  label: string
  /** Show the month containing `date` (keyboard navigation past the shown weeks). */
  onShowMonth: (date: Date) => void
  today: Date
  locale: string
  events: CalendarEvent[]
  sprintPhases: SprintPhase[]
  taskDeadlinesByDate: Record<string, DeadlineEntry[]>
  expandedDay: string | null
  dragStart: string | null
  isMultiDayDrag: boolean
  isDayInDragRange: (dayStr: string) => boolean
  onDayMouseDown: (dayStr: string) => void
  onDayMouseEnter: (dayStr: string) => void
  onDayClick: (dateStr: string) => void
  onEventClick: (ev: CalendarEvent) => void
  onSprintBarClick: (sprintId: string) => void
  onDeadlineBadgeClick: (dateStr: string, entries: DeadlineEntry[]) => void
  onExpandDay: (dayStr: string | null) => void
}

type DayHandlers = Pick<
  MonthGridProps,
  | "onDayMouseDown"
  | "onDayMouseEnter"
  | "onDayClick"
  | "onEventClick"
  | "onSprintBarClick"
  | "onDeadlineBadgeClick"
  | "onExpandDay"
>

export default function MonthGrid(props: MonthGridProps) {
  const { t } = useLanguage()
  const weekdays = t.calendarWeekdays
  const { calendarDays, currentMonth, today, expandedDay, dragStart, isMultiDayDrag, isDayInDragRange } = props
  const { gridRef, tabStop, onKeyDown, onDayFocus } = useMonthGridFocus({
    calendarDays,
    currentYear: props.currentYear,
    currentMonth,
    today,
    onShowMonth: props.onShowMonth,
  })
  const gridStart = calendarDays.length > 0 ? toDateStr(calendarDays[0]) : ""
  const weeks = Array.from({ length: Math.ceil(calendarDays.length / 7) }, (_, w) => calendarDays.slice(w * 7, w * 7 + 7))
  // Stable handler identities + per-cell primitive props let the memoized
  // DayCell skip re-rendering: a drag only re-renders cells entering/leaving the range.
  const handlers = useStableHandlers<DayHandlers>({
    onDayMouseDown: props.onDayMouseDown,
    onDayMouseEnter: props.onDayMouseEnter,
    onDayClick: props.onDayClick,
    onEventClick: props.onEventClick,
    onSprintBarClick: props.onSprintBarClick,
    onDeadlineBadgeClick: props.onDeadlineBadgeClick,
    onExpandDay: props.onExpandDay,
  })

  return (
    <>
      <p className="sr-only">{t.calendarDragHint}</p>
      <div className="grid grid-cols-7 border-b border-l border-border bg-surface shrink-0" aria-hidden>
        {weekdays.map((wd, i) => (
          <div
            key={wd}
            className={cn(
              "py-2.5 text-center text-caption font-bold uppercase tracking-widest border-r border-border",
              i === 0 || i === 6 ? "text-fg-subtle" : "text-fg-muted",
            )}
          >
            {wd}
          </div>
        ))}
      </div>

      {/* One Tab stop (roving tabindex); arrows / Home / End / PageUp / PageDown move the focused day. */}
      <div
        ref={gridRef}
        role="grid"
        aria-label={props.label}
        onKeyDown={onKeyDown}
        className="grid grid-cols-7 flex-1 min-h-0 overflow-auto"
      >
        {weeks.map((week) => (
          <div key={toDateStr(week[0])} role="row" className="contents">
            {week.map((day, col) => {
              const dayStr = toDateStr(day)
              const inDragRange = isDayInDragRange(dayStr)
              return (
                <DayCell
                  key={dayStr}
                  day={day}
                  dayStr={dayStr}
                  gridStart={gridStart}
                  isTabStop={dayStr === tabStop}
                  onDayFocus={onDayFocus}
                  isRowStart={col === 0}
                  isCurrentMonth={day.getMonth() === currentMonth}
                  isToday={isSameDay(day, today)}
                  locale={props.locale}
                  events={props.events}
                  sprintPhases={props.sprintPhases}
                  deadlineEntries={props.taskDeadlinesByDate[dayStr]}
                  isExpanded={expandedDay === dayStr}
                  isDragging={dragStart !== null}
                  inDragRange={inDragRange}
                  showDragBar={inDragRange && isMultiDayDrag}
                  handlers={handlers}
                />
              )
            })}
          </div>
        ))}
      </div>
    </>
  )
}

interface DayCellProps {
  day: Date
  dayStr: string
  /** First day shown in the grid (a sprint that started earlier is focusable there). */
  gridStart: string
  isTabStop: boolean
  onDayFocus: (dayStr: string) => void
  isRowStart: boolean
  isCurrentMonth: boolean
  isToday: boolean
  locale: string
  events: CalendarEvent[]
  sprintPhases: SprintPhase[]
  deadlineEntries: DeadlineEntry[] | undefined
  isExpanded: boolean
  isDragging: boolean
  inDragRange: boolean
  showDragBar: boolean
  handlers: DayHandlers
}

const DayCell = memo(function DayCell({
  day,
  dayStr,
  gridStart,
  isTabStop,
  onDayFocus,
  isRowStart,
  isCurrentMonth,
  isToday,
  locale,
  events,
  sprintPhases,
  deadlineEntries,
  isExpanded,
  isDragging,
  inDragRange,
  showDragBar,
  handlers,
}: DayCellProps) {
  const { t, language } = useLanguage()
  const { onDayMouseDown, onDayMouseEnter, onDayClick, onEventClick, onSprintBarClick, onDeadlineBadgeClick, onExpandDay } =
    handlers
  const isWeekend = day.getDay() === 0 || day.getDay() === 6
  const dayEvents = events.filter((ev) => eventCoversDay(ev, dayStr))
  const totalDeadlineTasks = deadlineEntries?.reduce((sum, en) => sum + en.tasks.length, 0) ?? 0
  const phases = sprintPhases.filter((sp) => dayStr >= datePart(sp.startDate) && dayStr <= datePart(sp.endDate))
  const visibleEvents = isExpanded ? dayEvents : dayEvents.slice(0, MAX_VISIBLE_EVENTS)
  const hiddenCount = dayEvents.length - MAX_VISIBLE_EVENTS
  const fullDate = day.toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric", weekday: "short" })
  const eventTitle = (ev: CalendarEvent) => pickText(i18nOf(ev), "title", ev.title, language).text

  return (
    <div
      role="gridcell"
      className={cn(
        "border-b border-r border-border min-h-[120px] flex flex-col cursor-pointer select-none",
        isRowStart && "border-l",
        isWeekend && !isToday ? "bg-surface-muted" : "bg-surface",
        isToday && "bg-primary-soft/40 ring-1 ring-inset ring-primary/40",
        inDragRange ? "bg-primary-soft" : "hover:bg-surface-muted",
      )}
      onMouseDown={() => onDayMouseDown(dayStr)}
      onMouseEnter={() => onDayMouseEnter(dayStr)}
      onClick={() => {
        if (!isDragging) onDayClick(dayStr)
      }}
    >
      {phases.length > 0 && (
        <div className="space-y-0.5 px-0.5 pt-0.5">
          {phases.map((sp) => (
            <SprintBar
              key={sp.id}
              sprint={sp}
              dayStr={dayStr}
              showLabel={isRowStart || datePart(sp.startDate) === dayStr}
              focusable={datePart(sp.startDate) === dayStr || (dayStr === gridStart && datePart(sp.startDate) < dayStr)}
              onClick={() => onSprintBarClick(sp.id)}
            />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between px-1.5 pt-1">
        <button
          type="button"
          data-cal-day={dayStr}
          tabIndex={isTabStop ? 0 : -1}
          onFocus={() => onDayFocus(dayStr)}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onDayClick(dayStr)
          }}
          aria-label={fmt(t.calendarAddOnDate, { date: fullDate })}
          aria-current={isToday ? "date" : undefined}
          className={cn(
            "text-caption font-semibold leading-none w-7 h-7 flex items-center justify-center rounded-full",
            isToday
              ? "bg-primary text-primary-fg shadow-ui-sm"
              : isCurrentMonth
                ? "text-fg hover:bg-surface-sunken"
                : "text-fg-subtle hover:bg-surface-sunken",
          )}
        >
          {day.getDate()}
        </button>
        {totalDeadlineTasks > 0 && deadlineEntries && (
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onDeadlineBadgeClick(dayStr, deadlineEntries)
            }}
            className="bg-danger-soft text-danger-strong text-caption font-bold rounded-full px-2 py-0.5 hover:brightness-95"
            title={fmt(t.calendarTasksDue, { count: totalDeadlineTasks })}
            aria-label={fmt(t.calendarTasksDue, { count: totalDeadlineTasks })}
          >
            {totalDeadlineTasks}
          </button>
        )}
      </div>

      <div className="flex-1 px-1 mt-1 space-y-0.5 overflow-hidden">
        {visibleEvents.map((ev) => (
          <button
            key={ev.id}
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onEventClick(ev)
            }}
            className={cn(
              "w-full text-left text-caption leading-tight px-1.5 py-1 rounded-md border-l-[3px] bg-surface truncate shadow-ui-sm hover:shadow",
              eventColorBorder[ev.color] ?? "border-l-gray-500",
            )}
            title={eventTitle(ev)}
          >
            <span className="font-medium text-fg">{eventTitle(ev)}</span>
          </button>
        ))}
        {hiddenCount > 0 && (
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onExpandDay(isExpanded ? null : dayStr)
            }}
            aria-expanded={isExpanded}
            className={cn(
              "w-full text-center text-caption font-semibold rounded-md py-0.5",
              isExpanded ? "text-fg-muted hover:bg-surface-sunken" : "text-primary-strong hover:bg-primary-soft",
            )}
          >
            {isExpanded ? t.calendarShowLess : fmt(t.calendarMoreEvents, { count: hiddenCount })}
          </button>
        )}
      </div>

      {showDragBar && <div className="mx-1 mb-1 h-1 rounded-full bg-primary/60" aria-hidden />}
    </div>
  )
})

/**
 * One day's segment of a sprint bar. Only one segment per bar (its first day in
 * the grid) is focusable and announced; the others are mouse targets only.
 */
function SprintBar({
  sprint,
  dayStr,
  showLabel,
  focusable,
  onClick,
}: {
  sprint: SprintPhase
  dayStr: string
  showLabel: boolean
  focusable: boolean
  onClick: () => void
}) {
  const { t, language } = useLanguage()
  const name = pickText(i18nOf(sprint), "sprintName", sprint.sprintName, language).text
  const label = fmt(t.calendarSprintProgress, { sprint: name, progress: sprint.progress })
  const isStart = datePart(sprint.startDate) === dayStr
  const isEnd = datePart(sprint.endDate) === dayStr
  const rounded = cn(isStart && "rounded-l-full", isEnd && "rounded-r-full")

  return (
    <button
      type="button"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={cn(
        "w-full h-4 bg-gradient-to-r relative overflow-hidden hover:brightness-110 block",
        sprintGradient[sprint.status] ?? "from-gray-200/80 to-gray-100/40",
        rounded,
        isStart && "ml-0.5",
        isEnd && "mr-0.5",
      )}
      title={label}
      aria-label={focusable ? label : undefined}
      aria-hidden={focusable ? undefined : true}
      tabIndex={focusable ? undefined : -1}
    >
      <span
        className={cn(
          "absolute left-0 top-0 h-full opacity-40 pointer-events-none",
          sprintStatusColor[sprint.status] ?? "bg-gray-400",
          rounded,
        )}
        style={{ width: `${sprint.progress}%` }}
        aria-hidden
      />
      {showLabel && (
        <span
          className={cn(
            "relative block px-1.5 text-left text-caption leading-4 font-bold truncate pointer-events-none",
            sprintTextColor[sprint.status] ?? "text-fg-muted",
          )}
          aria-hidden
        >
          {name} {sprint.progress}%
        </span>
      )}
    </button>
  )
}
