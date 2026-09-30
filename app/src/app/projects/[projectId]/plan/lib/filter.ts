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

export const NAME_COLUMN_WIDTH = 240
export const NAME_COLUMN_WIDTH_COMPACT = 180
export const COLUMN_WIDTH: Record<PlanColumn, number> = {
  start: 92,
  end: 92,
  duration: 56,
  progress: 104,
  owner: 104,
  status: 104,
}

export function visibleColumns(hidden: readonly PlanColumn[], collapsed: boolean, all: readonly PlanColumn[]): PlanColumn[] {
  return collapsed ? [] : all.filter((c) => !hidden.includes(c))
}

export function gridWidth(columns: readonly PlanColumn[], collapsed: boolean): number {
  const name = collapsed ? NAME_COLUMN_WIDTH_COMPACT : NAME_COLUMN_WIDTH
  return name + columns.reduce((sum, c) => sum + COLUMN_WIDTH[c], 0)
}

/** Row-drag drop target: which row the pointer is over and which half of it. */
export function dropTargetAt(offsetY: number, rowIds: readonly string[], rowHeight: number): { targetId: string; position: "before" | "after" } | null {
  if (rowIds.length === 0) return null
  const idx = Math.min(rowIds.length - 1, Math.max(0, Math.floor(offsetY / rowHeight)))
  const within = offsetY - idx * rowHeight
  const position = offsetY < 0 ? "before" : offsetY >= rowIds.length * rowHeight ? "after" : within < rowHeight / 2 ? "before" : "after"
  return { targetId: rowIds[idx], position }
}
