"use client"

import { forwardRef, useCallback, useId, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { useLanguage } from "@/lib/language-context"
import type { Translations } from "@/lib/i18n"
import { daysBetween, formatYmd, statusBarColor, type FlatRow, type PlanItem } from "./lib/plan-utils"
import { HEADER_HEIGHT, ROW_HEIGHT } from "./plan-tree-pane"
import type { useBarDrag } from "./use-bar-drag"

interface PlanTimelineProps {
  rows: FlatRow[]
  chartMin: Date
  chartMax: Date
  dayWidth: number
  todayX: number
  canEdit: boolean
  drag: ReturnType<typeof useBarDrag>
  onOpen: (item: PlanItem) => void
  itemName: (item: PlanItem) => string
}

function useMonthCells(chartMin: Date, chartMax: Date, dayWidth: number) {
  return useMemo(() => {
    const out: { label: string; start: number; width: number }[] = []
    let cursor = new Date(chartMin)
    while (cursor.getTime() < chartMax.getTime()) {
      const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
      const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
      const visStart = monthStart.getTime() < chartMin.getTime() ? chartMin : monthStart
      const visEnd = nextMonth.getTime() > chartMax.getTime() ? chartMax : nextMonth
      out.push({
        label: `${cursor.getFullYear()}/${cursor.getMonth() + 1}`,
        start: daysBetween(chartMin, visStart) * dayWidth,
        width: daysBetween(visStart, visEnd) * dayWidth,
      })
      cursor = nextMonth
    }
    return out
  }, [chartMin, chartMax, dayWidth])
}

function statusLabel(status: string, t: Translations): string {
  switch (status) {
    case "done":
      return t.planStatusDone
    case "in_progress":
      return t.planStatusInProgress
    case "delayed":
      return t.planStatusDelayed
    case "on_hold":
      return t.planStatusOnHold
    default:
      return t.planStatusNotStarted
  }
}

/** Keys that move focus between bars (roving tabindex) instead of editing one. */
const NAV_KEYS = new Set(["ArrowUp", "ArrowDown", "Home", "End"])

/**
 * Roving tabindex over the timeline bars: only one bar is a Tab stop (the
 * last focused one, else the first row), so each plan item is reached once by
 * Tab (via the tree) plus one stop for the whole timeline. Arrow Up/Down and
 * Home/End move between bars; Left/Right keep moving the focused bar's dates.
 */
function useRovingBars(rows: FlatRow[]) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const tabStopId =
    activeId !== null && rows.some((r) => r.item.id === activeId) ? activeId : (rows[0]?.item.id ?? null)

  const onNavigate = useCallback((e: KeyboardEvent<HTMLElement>): boolean => {
    if (!NAV_KEYS.has(e.key)) return false
    e.preventDefault()
    const bars = Array.from(containerRef.current?.querySelectorAll<HTMLElement>("[data-plan-bar]") ?? [])
    const index = bars.indexOf(e.currentTarget)
    if (index < 0 || bars.length === 0) return true
    const last = bars.length - 1
    const next =
      e.key === "Home" ? 0 : e.key === "End" ? last : Math.min(last, Math.max(0, index + (e.key === "ArrowUp" ? -1 : 1)))
    bars[next].focus()
    return true
  }, [])

  return { containerRef, tabStopId, setActiveId, onNavigate }
}

type TimelineRowProps = Omit<PlanTimelineProps, "rows" | "chartMax" | "todayX"> & {
  item: PlanItem
  hintId: string
  isTabStop: boolean
  onBarFocus: (id: string) => void
  onNavigate: (e: KeyboardEvent<HTMLElement>) => boolean
}

function TimelineRow({
  item, chartMin, dayWidth, canEdit, drag, onOpen, itemName, hintId, isTabStop, onBarFocus, onNavigate,
}: TimelineRowProps) {
  const { t } = useLanguage()
  const name = itemName(item)
  const startDays = Math.max(0, daysBetween(chartMin, new Date(item.plannedStart)))
  const endDays = Math.max(startDays + 1, daysBetween(chartMin, new Date(item.plannedEnd)))
  const barLeft = startDays * dayWidth
  const barWidth = Math.max(dayWidth * 0.5, (endDays - startDays) * dayWidth)
  const actualLeft = item.actualStart ? daysBetween(chartMin, new Date(item.actualStart)) * dayWidth : null
  const actualEnd = item.actualEnd ? daysBetween(chartMin, new Date(item.actualEnd)) * dayWidth : null
  const dragHandlers = { onPointerMove: drag.onPointerMove, onPointerUp: drag.onPointerUp, onPointerCancel: drag.onPointerUp }
  const rovingProps = {
    "data-plan-bar": item.id,
    tabIndex: isTabStop ? 0 : -1,
    onFocus: () => onBarFocus(item.id),
  }

  if (item.isMilestone) {
    return (
      <button
        type="button"
        {...rovingProps}
        onClick={() => onOpen(item)}
        onKeyDown={onNavigate}
        aria-label={t.planMilestoneLabel.replace("{name}", name).replace("{date}", formatYmd(item.plannedEnd))}
        className="absolute top-1/2 -translate-y-1/2 p-1 rounded-ui-sm"
        style={{ left: barLeft + Math.min(8, dayWidth / 2) - 12 }}
        title={name}
      >
        <span aria-hidden="true" className="block w-4 h-4 bg-violet-600 rotate-45 shadow-md" />
      </button>
    )
  }

  const barLabel = t.planBarLabel
    .replace("{name}", name)
    .replace("{start}", formatYmd(item.plannedStart))
    .replace("{end}", formatYmd(item.plannedEnd))
    .replace("{pct}", String(item.progressPct))
    .replace("{status}", statusLabel(item.status, t))

  return (
    <>
      <div
        role="button"
        {...rovingProps}
        aria-label={barLabel}
        aria-describedby={canEdit ? hintId : undefined}
        className={`absolute top-1/2 -translate-y-1/2 rounded-md shadow-sm overflow-hidden ${statusBarColor(item.status)} ${canEdit ? "cursor-grab active:cursor-grabbing touch-none" : "cursor-pointer"}`}
        style={{ left: barLeft, width: barWidth, height: 18 }}
        onPointerDown={(e) => drag.onPointerDown(e, item, "move")}
        {...dragHandlers}
        onDoubleClick={() => onOpen(item)}
        onKeyDown={(e) => {
          if (!onNavigate(e)) drag.onKeyDown(e, item, onOpen)
        }}
        onBlur={drag.onBlur}
        title={`${name} (${item.progressPct}%)`}
      >
        {/* Progress darkens the bar, so the white label only gains contrast. */}
        <div aria-hidden="true" className="absolute inset-y-0 left-0 bg-black/25" style={{ width: `${item.progressPct}%` }} />
        <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center text-caption leading-none text-white font-medium px-1 truncate pointer-events-none">
          {name}
        </span>
        {canEdit && (
          <div
            aria-hidden="true"
            className="absolute right-0 top-0 h-full w-2 cursor-ew-resize bg-black/10 hover:bg-black/30"
            onPointerDown={(e) => drag.onPointerDown(e, item, "resize")}
            {...dragHandlers}
          />
        )}
      </div>
      {actualLeft !== null && actualEnd !== null && actualEnd > actualLeft && (
        <div
          aria-hidden="true"
          className="absolute rounded bg-gray-700/60"
          style={{ left: actualLeft, width: Math.max(2, actualEnd - actualLeft), top: ROW_HEIGHT - 8, height: 4 }}
          title={t.planActualRange.replace("{range}", `${formatYmd(item.actualStart!)} ~ ${formatYmd(item.actualEnd!)}`)}
        />
      )}
    </>
  )
}

/**
 * Right pane: month header, planned/actual bars and the today line. Bars are
 * focusable with a roving tabindex (one Tab stop; Up/Down/Home/End move between
 * bars): Enter opens the editor, Left/Right move / Shift+Left/Right resizes
 * (WCAG 2.5.7 single-pointer alternative to dragging). Month header and today
 * line are decorative.
 */
export const PlanTimeline = forwardRef<HTMLDivElement, PlanTimelineProps>(function PlanTimeline(
  { rows, chartMin, chartMax, dayWidth, todayX, canEdit, drag, onOpen, itemName },
  ref,
) {
  const { t } = useLanguage()
  const months = useMonthCells(chartMin, chartMax, dayWidth)
  const totalWidth = Math.max(1, daysBetween(chartMin, chartMax)) * dayWidth
  const hintId = useId()
  const { containerRef, tabStopId, setActiveId, onNavigate } = useRovingBars(rows)

  return (
    <div ref={ref} className="flex-1 overflow-x-auto overflow-y-hidden">
      <p id={hintId} className="sr-only">{t.planBarKeyboardHint}</p>
      <div className="relative" style={{ width: totalWidth, minWidth: "100%" }}>
        <div aria-hidden="true" className="sticky top-0 z-10 bg-surface-muted border-b border-border" style={{ height: HEADER_HEIGHT }}>
          {months.map((c) => (
            <div
              key={c.label}
              className="absolute top-0 h-full text-caption text-fg-muted px-2 py-2 border-r border-border flex items-end"
              style={{ left: c.start, width: c.width }}
            >
              {c.label}
            </div>
          ))}
        </div>

        <div ref={containerRef} className="relative">
          {rows.map((row) => (
            <div key={row.item.id} className="relative border-b border-border/60" style={{ height: ROW_HEIGHT }}>
              <TimelineRow
                item={row.item}
                chartMin={chartMin}
                dayWidth={dayWidth}
                canEdit={canEdit}
                drag={drag}
                onOpen={onOpen}
                itemName={itemName}
                hintId={hintId}
                isTabStop={row.item.id === tabStopId}
                onBarFocus={setActiveId}
                onNavigate={onNavigate}
              />
            </div>
          ))}
          <div aria-hidden="true" className="absolute top-0 bottom-0 w-px bg-red-400/70 pointer-events-none" style={{ left: todayX }} title={t.planToday}>
            <span className="absolute top-0 -translate-x-1/2 text-caption leading-none text-red-600 bg-white px-1 rounded">●</span>
          </div>
        </div>
      </div>
    </div>
  )
})
