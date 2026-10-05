/**
 * Pixel geometry of the timeline. Bars are end-inclusive: an item from 10/01
 * to 10/03 covers three day columns. Milestones sit at the centre of their day.
 */
import { ymdToDay } from "./date"
import { isDatedItem, type PlanDependency, type PlanItem, type Ymd } from "./plan-types"

export const ROW_HEIGHT = 40
/** Vertical layout inside a row (top offsets / heights in px). */
export const ROW_LAYOUT = {
  actual: { top: 4, height: 3 },
  bar: { top: 10, height: 16 },
  baseline: { top: 29, height: 3 },
  sprint: { top: 34, height: 4 },
} as const
export const ROW_CENTER = ROW_LAYOUT.bar.top + ROW_LAYOUT.bar.height / 2

export interface Span {
  x: number
  width: number
}

/** Left edge and width of an inclusive [start, end] range. */
export function spanGeometry(start: Ymd, end: Ymd, startDay: number, dayWidth: number): Span {
  const s = ymdToDay(start)
  const e = Math.max(s, ymdToDay(end))
  return { x: (s - startDay) * dayWidth, width: (e - s + 1) * dayWidth }
}

/** X of the centre of a day (milestones, today line). */
export function dayCenterX(date: Ymd, startDay: number, dayWidth: number): number {
  return (ymdToDay(date) - startDay + 0.5) * dayWidth
}

/** Where arrows leave (finish) and enter (start) an item; null for an undated item (no bar). */
export function itemAnchors(item: PlanItem, startDay: number, dayWidth: number): { startX: number; endX: number } | null {
  if (!isDatedItem(item)) return null
  if (item.isMilestone) {
    const c = dayCenterX(item.plannedEnd, startDay, dayWidth)
    return { startX: c, endX: c }
  }
  const g = spanGeometry(item.plannedStart, item.plannedEnd, startDay, dayWidth)
  return { startX: g.x, endX: g.x + g.width }
}

/**
 * Finish-to-start violation: the successor starts on or before the day the
 * predecessor ends. A milestone is an instant, so a successor may start on
 * the milestone's own day (and a milestone may fall on its predecessor's last day).
 */
export function isDependencyViolated(pred: PlanItem, succ: PlanItem): boolean {
  if (!isDatedItem(pred) || !isDatedItem(succ)) return false
  const gap = pred.isMilestone || succ.isMilestone ? 0 : 1
  return ymdToDay(succ.plannedStart) < ymdToDay(pred.plannedEnd) + gap
}

const STUB = 8

/**
 * Orthogonal finish-to-start connector. When the successor starts far enough
 * right, the line drops straight down; otherwise it detours through the gap
 * between the rows.
 */
export function dependencyPath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  if (to.x - STUB >= from.x + STUB) {
    const mid = from.x + STUB
    return `M ${from.x} ${from.y} H ${mid} V ${to.y} H ${to.x}`
  }
  const between = to.y > from.y ? to.y - ROW_HEIGHT / 2 : to.y + ROW_HEIGHT / 2
  return `M ${from.x} ${from.y} H ${from.x + STUB} V ${between} H ${to.x - STUB} V ${to.y} H ${to.x}`
}

export interface DependencyArrow {
  id: string
  predecessorId: string
  successorId: string
  d: string
  violated: boolean
}

/** Arrows between visible rows (`rowIndex`: item id → row index); hidden or undated endpoints are skipped. */
export function buildArrows(
  deps: readonly PlanDependency[],
  byId: ReadonlyMap<string, PlanItem>,
  rowIndex: ReadonlyMap<string, number>,
  startDay: number,
  dayWidth: number,
): DependencyArrow[] {
  const out: DependencyArrow[] = []
  for (const dep of deps) {
    const pred = byId.get(dep.predecessorId)
    const succ = byId.get(dep.successorId)
    const pi = rowIndex.get(dep.predecessorId)
    const si = rowIndex.get(dep.successorId)
    if (!pred || !succ || pi === undefined || si === undefined) continue
    const a = itemAnchors(pred, startDay, dayWidth)
    const b = itemAnchors(succ, startDay, dayWidth)
    if (!a || !b) continue
    const from = { x: a.endX, y: pi * ROW_HEIGHT + ROW_CENTER }
    const to = { x: b.startX, y: si * ROW_HEIGHT + ROW_CENTER }
    out.push({ id: dep.id, predecessorId: dep.predecessorId, successorId: dep.successorId, d: dependencyPath(from, to), violated: isDependencyViolated(pred, succ) })
  }
  return out
}
