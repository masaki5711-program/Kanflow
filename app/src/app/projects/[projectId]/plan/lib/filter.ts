/**
 * Toolbar filters (name text, state, owner) and the row-drag drop target.
 * Grid widths live in grid-layout.ts.
 */
import type { PlanItem, ScheduleState } from "./plan-types"

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

/** Row-drag drop target: which row the pointer is over and which half of it. */
export function dropTargetAt(offsetY: number, rowIds: readonly string[], rowHeight: number): { targetId: string; position: "before" | "after" } | null {
  if (rowIds.length === 0) return null
  const idx = Math.min(rowIds.length - 1, Math.max(0, Math.floor(offsetY / rowHeight)))
  const within = offsetY - idx * rowHeight
  const position = offsetY < 0 ? "before" : offsetY >= rowIds.length * rowHeight ? "after" : within < rowHeight / 2 ? "before" : "after"
  return { targetId: rowIds[idx], position }
}
