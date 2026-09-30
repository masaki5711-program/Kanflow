/**
 * Toolbar filters (name text, state, owner) and the grid column layout.
 */
import type { PlanItem, ScheduleState } from "./plan-types"
import type { PlanColumn } from "./prefs"

export const OWNER_NONE = "__none"

export interface PlanFilter {
  q: string
  /** A schedule state (including "on_hold"), or "" (any). */
  state: ScheduleState | ""
  /** Owner user id, OWNER_NONE, or "" (any). */
  owner: string
}

export const EMPTY_FILTER: PlanFilter = Object.freeze({ q: "", state: "", owner: "" }) as PlanFilter

export function isFilterActive(f: PlanFilter): boolean {
  return !!(f.q.trim() || f.state || f.owner)
}

/** `name` is the displayed (localized) name, matched case-insensitively together with the original. */
export function matchesFilter(item: PlanItem, f: PlanFilter, name: string): boolean {
  const q = f.q.trim().toLowerCase()
  if (q && !name.toLowerCase().includes(q) && !item.name.toLowerCase().includes(q)) return false
  if (f.state === "on_hold" && item.status !== "on_hold") return false
  if (f.state && f.state !== "on_hold" && (item.status === "on_hold" || item.scheduleState !== f.state)) return false
  if (f.owner === OWNER_NONE && item.owner) return false
  if (f.owner && f.owner !== OWNER_NONE && item.owner?.id !== f.owner) return false
  return true
}

/** Default name column width (desktop) and on a narrow screen where the grid starts names-only. */
export const NAME_COLUMN_WIDTH = 240
export const NAME_COLUMN_WIDTH_COMPACT = 180
export const NAME_WIDTH_MIN = 120
export const NAME_WIDTH_MAX = 640
/** The splitter never squeezes the visible timeline below this (or 40% of a phone-width chart). */
export const MIN_TIMELINE_WIDTH = 200
const MIN_TIMELINE_SHARE = 0.4
export const COLUMN_WIDTH: Record<PlanColumn, number> = {
  period: 128,
  start: 96,
  end: 96,
  duration: 64,
  progress: 104,
  owner: 124,
  status: 140,
}

/** Visible columns in canonical order (none while the grid is names-only). */
export function visibleColumns(shown: readonly PlanColumn[], collapsed: boolean, all: readonly PlanColumn[]): PlanColumn[] {
  return collapsed ? [] : all.filter((c) => shown.includes(c))
}

export function columnsWidth(columns: readonly PlanColumn[]): number {
  return columns.reduce((sum, c) => sum + COLUMN_WIDTH[c], 0)
}

export function gridWidth(columns: readonly PlanColumn[], nameWidth: number): number {
  return nameWidth + columnsWidth(columns)
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Allowed name widths for the splitter in a chart box of `containerWidth` (0 = not measured yet). */
export function nameWidthBounds(containerWidth: number, columns: readonly PlanColumn[]): { min: number; max: number } {
  const minTimeline = Math.min(MIN_TIMELINE_WIDTH, Math.round(containerWidth * MIN_TIMELINE_SHARE))
  const roomMax = containerWidth > 0 ? containerWidth - columnsWidth(columns) - minTimeline : NAME_WIDTH_MAX
  return { min: NAME_WIDTH_MIN, max: clamp(roomMax, NAME_WIDTH_MIN, NAME_WIDTH_MAX) }
}

/**
 * Name column width actually used: the viewer's splitter width (or the
 * default) kept inside the bounds, so the timeline always keeps
 * MIN_TIMELINE_WIDTH of the chart box.
 */
export function resolveNameWidth(pref: number | null, opts: { compact: boolean; containerWidth: number; columns: readonly PlanColumn[] }): number {
  const { min, max } = nameWidthBounds(opts.containerWidth, opts.columns)
  return clamp(Math.round(pref ?? (opts.compact ? NAME_COLUMN_WIDTH_COMPACT : NAME_COLUMN_WIDTH)), min, max)
}

/** Row-drag drop target: which row the pointer is over and which half of it. */
export function dropTargetAt(offsetY: number, rowIds: readonly string[], rowHeight: number): { targetId: string; position: "before" | "after" } | null {
  if (rowIds.length === 0) return null
  const idx = Math.min(rowIds.length - 1, Math.max(0, Math.floor(offsetY / rowHeight)))
  const within = offsetY - idx * rowHeight
  const position = offsetY < 0 ? "before" : offsetY >= rowIds.length * rowHeight ? "after" : within < rowHeight / 2 ? "before" : "after"
  return { targetId: rowIds[idx], position }
}
