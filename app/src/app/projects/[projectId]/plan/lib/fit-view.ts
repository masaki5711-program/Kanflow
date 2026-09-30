/**
 * "Show everything" (全体表示) for the timeline: the zoom and scroll that put
 * all live work plus today in view, and the first-view rule that falls back
 * to it when the usual anchor would open on an empty window (A3-09). Pure.
 */
import { initialScrollLeft } from "../hooks/use-plan-scroll"
import { ymdToDay } from "./date"
import { dayCenterX } from "./geometry"
import type { PlanItem, Ymd } from "./plan-types"
import { PLAN_ZOOMS, ZOOM_DAY_WIDTH, chartRange, type PlanZoom } from "./scale"
import { LEAD_DAYS, initialAnchorDay, isUnfinished, itemSpans, offscreenSummary } from "./viewport"

export interface ViewTarget {
  zoom: PlanZoom
  /** scrollLeft of the chart box at `zoom`. */
  left: number
}

type Dated = Pick<PlanItem, "plannedStart" | "plannedEnd" | "status" | "scheduleState">

/** First / last day of the live items (all items when none is live) and today. */
export function liveSpanDays(items: readonly Dated[], today: Ymd): { first: number; last: number } {
  const live = items.filter(isUnfinished)
  const pool = live.length > 0 ? live : items
  let first = ymdToDay(today)
  let last = first
  for (const it of pool) {
    const s = ymdToDay(it.plannedStart)
    const e = ymdToDay(it.plannedEnd)
    if (s < first) first = s
    if (e > last) last = e
  }
  return { first, last }
}

/** The most detailed zoom whose day width shows `days` days in `visibleWidth` px (quarter when none does). */
export function zoomToFit(days: number, visibleWidth: number): PlanZoom {
  return PLAN_ZOOMS.find((z) => days * ZOOM_DAY_WIDTH[z] <= visibleWidth) ?? "quarter"
}

/**
 * Zoom + scroll that show every live item (of `shown`, the rendered rows) and
 * today, centred with LEAD_DAYS of air on both sides. `zoom` forces the zoom
 * (then only the scroll fits); `allItems` sets the chart range like the page does.
 */
export function fitTarget(allItems: readonly PlanItem[], shown: readonly PlanItem[], today: Ymd, visibleWidth: number, zoom?: PlanZoom): ViewTarget {
  const { first, last } = liveSpanDays(shown, today)
  const days = last - first + 1 + LEAD_DAYS * 2
  const z = zoom ?? zoomToFit(days, visibleWidth)
  const dw = ZOOM_DAY_WIDTH[z]
  const { startDay } = chartRange(allItems, today, z)
  const slack = Math.max(0, visibleWidth - days * dw) / 2
  return { zoom: z, left: Math.max(0, Math.round((first - LEAD_DAYS - startDay) * dw - slack)) }
}

/** True when at least one span overlaps [left, left + width). */
export function anyBarInView(items: readonly PlanItem[], startDay: number, dayWidth: number, left: number, width: number): boolean {
  const spans = itemSpans(items, startDay, dayWidth)
  const off = offscreenSummary(spans, left, left + width)
  return off.before + off.after < spans.length
}

/**
 * The first view at `zoom`: the usual anchor (earliest unfinished work, or
 * today) — unless that window would show no bar at all, in which case the
 * "show everything" fit applies (with its own zoom only when `mayZoom`).
 */
export function firstViewTarget(
  allItems: readonly PlanItem[],
  shown: readonly PlanItem[],
  today: Ymd,
  zoom: PlanZoom,
  visibleWidth: number,
  mayZoom: boolean,
): ViewTarget {
  const dw = ZOOM_DAY_WIDTH[zoom]
  const { startDay } = chartRange(allItems, today, zoom)
  const anchor = initialAnchorDay(allItems, today, visibleWidth / dw)
  const todayX = dayCenterX(today, startDay, dw)
  const left = initialScrollLeft(anchor, { startDay, dayWidth: dw, todayX, clientWidth: visibleWidth, gridWidth: 0 })
  if (shown.length === 0 || visibleWidth <= 0 || anyBarInView(shown, startDay, dw, left, visibleWidth)) return { zoom, left }
  return fitTarget(allItems, shown, today, visibleWidth, mayZoom ? undefined : zoom)
}
