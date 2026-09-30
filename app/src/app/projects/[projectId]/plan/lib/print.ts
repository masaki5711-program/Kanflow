/**
 * Print layout of the plan (A4 landscape). The chart is re-rendered for the
 * printout with a range that fits the page width, instead of printing the
 * scroll box (which always starts at the chart's range start):
 *   visible — the period currently scrolled into view
 *   all     — every item and today, fitted to the page
 */
import { ymdToDay } from "./date"
import type { PlanItem, Ymd } from "./plan-types"
import { zoomForDayWidth, type ChartRange, type PlanZoom } from "./scale"

export type PrintScope = "visible" | "all"
export const PRINT_SCOPES: readonly PrintScope[] = ["visible", "all"]

/** CSS px of chart width that fit an A4 landscape page with 8 mm margins and the page padding. */
export const PRINT_WIDTH = 1000
/** The grid keeps at most this much of the page for names. */
export const PRINT_NAME_MAX = 240
/** Room right of the last date for chips and milestone names. */
const PRINT_GUTTER_PX = 110
const PRINT_PAD_DAYS = 2

export interface PrintLayout {
  range: ChartRange
  dayWidth: number
  /** Zoom whose header tiers suit the fitted day width. */
  zoom: PlanZoom
}

/** Every planned / actual / baseline date and today, padded by two days. */
export function fullPlanRange(items: readonly PlanItem[], today: Ymd): ChartRange {
  let min = ymdToDay(today)
  let max = min
  for (const it of items) {
    for (const v of [it.plannedStart, it.plannedEnd, it.actualStart, it.actualEnd, it.baselineStart, it.baselineEnd]) {
      if (!v) continue
      const d = ymdToDay(v)
      if (d < min) min = d
      if (d > max) max = d
    }
  }
  const startDay = min - PRINT_PAD_DAYS
  return { startDay, days: max + PRINT_PAD_DAYS + 1 - startDay }
}

/** The days visible in the scroll box (`scrollLeft` / `visibleWidth` in px of a `dayWidth` timeline). */
export function visibleRange(screenStartDay: number, dayWidth: number, scrollLeft: number, visibleWidth: number): ChartRange {
  const first = Math.floor(Math.max(0, scrollLeft) / dayWidth)
  const last = Math.ceil((Math.max(0, scrollLeft) + Math.max(dayWidth, visibleWidth)) / dayWidth)
  return { startDay: screenStartDay + first, days: Math.max(1, last - first) }
}

/**
 * Fit `range` into the page next to a grid `gridWidth` px wide. "all" keeps a
 * gutter for chips after the last date; "visible" prints exactly the window.
 */
export function printLayout(range: ChartRange, gridWidth: number, scope: PrintScope): PrintLayout {
  const timeline = Math.max(200, PRINT_WIDTH - gridWidth)
  if (scope === "visible") {
    const dayWidth = timeline / range.days
    return { range, dayWidth, zoom: zoomForDayWidth(dayWidth) }
  }
  const dayWidth = Math.max(0.25, (timeline - PRINT_GUTTER_PX) / range.days)
  const days = Math.floor(timeline / dayWidth)
  return { range: { startDay: range.startDay, days }, dayWidth, zoom: zoomForDayWidth(dayWidth) }
}
