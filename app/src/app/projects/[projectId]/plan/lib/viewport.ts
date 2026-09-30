/**
 * What the visible part of the timeline shows: where the first view starts,
 * how many bars lie left / right of it (edge indicators) and where to scroll
 * to reveal one of them. Pure; the scroll hooks apply the numbers.
 */
import { ymdToDay } from "./date"
import { dayCenterX, spanGeometry } from "./geometry"
import type { PlanItem, Ymd } from "./plan-types"

/** Days shown before the anchor so the first bar does not touch the grid edge. */
export const LEAD_DAYS = 3
/** Half width of a milestone diamond (hit box for the edge counts). */
const MILESTONE_HALF = 8

/** Work that still matters on the first view: not done and not paused. */
export function isUnfinished(item: Pick<PlanItem, "status" | "scheduleState">): boolean {
  return item.status !== "done" && item.status !== "on_hold" && item.scheduleState !== "done"
}

/**
 * First day of the initial view: min(today, earliest unfinished start) − LEAD_DAYS,
 * so overdue / running work is on screen. Null when nothing is unfinished
 * (the caller then centres on today).
 */
export function initialAnchorDay(items: readonly PlanItem[], today: Ymd): number | null {
  let earliest: number | null = null
  for (const it of items) {
    if (!isUnfinished(it)) continue
    const d = ymdToDay(it.plannedStart)
    if (earliest === null || d < earliest) earliest = d
  }
  if (earliest === null) return null
  return Math.min(ymdToDay(today), earliest) - LEAD_DAYS
}

export interface RowSpan {
  id: string
  x: number
  width: number
}

/** Horizontal extent of every item's mark (bar, bracket or diamond) in timeline px. */
export function itemSpans(items: readonly PlanItem[], startDay: number, dayWidth: number): RowSpan[] {
  return items.map((it) => {
    if (it.isMilestone) return { id: it.id, x: dayCenterX(it.plannedEnd, startDay, dayWidth) - MILESTONE_HALF, width: MILESTONE_HALF * 2 }
    const g = spanGeometry(it.plannedStart, it.plannedEnd, startDay, dayWidth)
    return { id: it.id, ...g }
  })
}

export interface Offscreen {
  before: number
  after: number
  /** The hidden span closest to the visible window on each side (scroll target). */
  nearestBefore: RowSpan | null
  nearestAfter: RowSpan | null
}

/** Marks entirely left of [viewStart, viewEnd) / entirely right of it. */
export function offscreenSummary(spans: readonly RowSpan[], viewStart: number, viewEnd: number): Offscreen {
  let before = 0
  let after = 0
  let nearestBefore: RowSpan | null = null
  let nearestAfter: RowSpan | null = null
  for (const s of spans) {
    if (s.x + s.width <= viewStart) {
      before += 1
      if (!nearestBefore || s.x + s.width > nearestBefore.x + nearestBefore.width) nearestBefore = s
    } else if (s.x >= viewEnd) {
      after += 1
      if (!nearestAfter || s.x < nearestAfter.x) nearestAfter = s
    }
  }
  return { before, after, nearestBefore, nearestAfter }
}

/**
 * scrollLeft that brings `span` into a window `visibleWidth` wide: a short
 * mark starts at 1/3 of the window, a long one starts near the left edge.
 */
export function revealScrollLeft(span: Pick<RowSpan, "x" | "width">, visibleWidth: number): number {
  const lead = span.width <= (visibleWidth * 2) / 3 ? visibleWidth / 3 : 16
  return Math.max(0, Math.round(span.x - lead))
}
