export interface PlanItem {
  id: string
  projectId: string
  parentId: string | null
  name: string
  description: string | null
  plannedStart: string
  plannedEnd: string
  actualStart: string | null
  actualEnd: string | null
  progressPct: number
  color: string | null
  status: string
  sortOrder: number
  isMilestone: boolean
  notes: string | null
}

export interface FlatRow {
  item: PlanItem
  depth: number
  hasChildren: boolean
}

const MS_PER_DAY = 86400000

export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY)
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * MS_PER_DAY)
}

export function clampDate(d: Date, min: Date, max: Date): Date {
  if (d.getTime() < min.getTime()) return min
  if (d.getTime() > max.getTime()) return max
  return d
}

/**
 * Build a flat depth-first ordered list of rows from the raw item array.
 * Respects sortOrder within each parent group. Honors `collapsed` (set of
 * item ids) by skipping their descendants.
 */
export function buildFlatTree(items: PlanItem[], collapsed: Set<string>): FlatRow[] {
  const byParent = new Map<string | null, PlanItem[]>()
  for (const it of items) {
    const key = it.parentId
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(it)
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder)
  }
  const rows: FlatRow[] = []
  function visit(parentId: string | null, depth: number) {
    const list = byParent.get(parentId) ?? []
    for (const it of list) {
      const hasChildren = (byParent.get(it.id)?.length ?? 0) > 0
      rows.push({ item: it, depth, hasChildren })
      if (hasChildren && !collapsed.has(it.id)) {
        visit(it.id, depth + 1)
      }
    }
  }
  visit(null, 0)
  return rows
}

/**
 * Compute the chart window (earliest plannedStart, latest plannedEnd) with
 * a small padding on each side so bars don't hug the edge. Falls back to a
 * 4-week window around today when no items exist.
 */
export function chartBounds(items: PlanItem[]): { min: Date; max: Date } {
  if (items.length === 0) {
    const today = startOfUtcDay(new Date())
    return { min: addDays(today, -7), max: addDays(today, 28) }
  }
  let min = new Date(items[0].plannedStart).getTime()
  let max = new Date(items[0].plannedEnd).getTime()
  for (const it of items) {
    const s = new Date(it.plannedStart).getTime()
    const e = new Date(it.plannedEnd).getTime()
    if (s < min) min = s
    if (e > max) max = e
    if (it.actualStart) {
      const a = new Date(it.actualStart).getTime()
      if (a < min) min = a
    }
    if (it.actualEnd) {
      const a = new Date(it.actualEnd).getTime()
      if (a > max) max = a
    }
  }
  return {
    min: addDays(startOfUtcDay(new Date(min)), -3),
    max: addDays(startOfUtcDay(new Date(max)), 7),
  }
}

export const ZOOM_DAY_WIDTH: Record<"day" | "week" | "month", number> = {
  day: 32,
  week: 14,
  month: 6,
}

export function formatYmd(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/**
 * Timeline bar fill per status. Bars carry 12px white labels, so every fill
 * keeps >= 4.5:1 against #fff (WCAG 1.4.3):
 *   done emerald-700 5.5 · in_progress blue-700 6.7 · delayed rose-700 6.3 ·
 *   on_hold amber-700 5.0 · not_started slate-500 4.8
 */
export function statusBarColor(status: string): string {
  switch (status) {
    case "done":
      return "bg-emerald-700"
    case "in_progress":
      return "bg-blue-700"
    case "delayed":
      return "bg-rose-700"
    case "on_hold":
      return "bg-amber-700"
    case "not_started":
    default:
      return "bg-slate-500"
  }
}

export type BarKeyAction =
  | { kind: "open" }
  | { kind: "move" | "resize"; deltaDays: number }

/**
 * Keyboard contract of a timeline bar (WCAG 2.5.7 alternative to dragging):
 * Enter/Space opens the editor, ArrowLeft/Right moves the bar by one day and
 * Shift+ArrowLeft/Right changes the end date by one day. Null = not handled.
 */
export function barKeyAction(key: string, shiftKey: boolean): BarKeyAction | null {
  if (key === "Enter" || key === " ") return { kind: "open" }
  if (key !== "ArrowLeft" && key !== "ArrowRight") return null
  const deltaDays = key === "ArrowLeft" ? -1 : 1
  return { kind: shiftKey ? "resize" : "move", deltaDays }
}

/**
 * Shift planned dates by whole days. "move" shifts both ends; "resize" moves
 * only the end and never lets it fall before the start (returns null when the
 * change would be invalid, so callers can ignore the key press).
 */
export function shiftPlanDates(
  start: Date,
  end: Date,
  mode: "move" | "resize",
  deltaDays: number,
): { start: Date; end: Date } | null {
  if (mode === "move") return { start: addDays(start, deltaDays), end: addDays(end, deltaDays) }
  const nextEnd = addDays(end, deltaDays)
  if (nextEnd.getTime() < start.getTime()) return null
  return { start, end: nextEnd }
}

export function statusBadgeColor(status: string): string {
  switch (status) {
    case "done":
      return "bg-emerald-100 text-emerald-700"
    case "in_progress":
      return "bg-blue-100 text-blue-700"
    case "delayed":
      return "bg-rose-100 text-rose-700"
    case "on_hold":
      return "bg-amber-100 text-amber-700"
    case "not_started":
    default:
      return "bg-gray-100 text-gray-700"
  }
}
