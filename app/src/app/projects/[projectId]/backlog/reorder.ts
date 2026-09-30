/**
 * Pure drag & drop reordering logic for one backlog section (pointer and
 * keyboard share the same session state). DOM wiring: use-reorder-dnd.ts.
 */
import type { BacklogStatus } from "./types"

export interface DragSession {
  mode: "keyboard" | "pointer"
  section: BacklogStatus
  itemId: string
  /** Visible ids of the section when the item was picked up. */
  ids: readonly string[]
  /** Index of the item when picked up. */
  from: number
  /** Index the item would land on if dropped now. */
  to: number
}

export type DragState = DragSession | null

export type DragAction =
  | { type: "pick"; mode: DragSession["mode"]; section: BacklogStatus; itemId: string; ids: readonly string[] }
  /** Keyboard ↑ / ↓. */
  | { type: "move"; delta: number }
  /** Pointer: insertion index among the other items (= final index). */
  | { type: "over"; index: number }
  | { type: "drop" }
  | { type: "cancel" }

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

function withTarget(state: DragSession, to: number): DragSession {
  const next = clamp(to, 0, state.ids.length - 1)
  return next === state.to ? state : { ...state, to: next }
}

export function dragReducer(state: DragState, action: DragAction): DragState {
  switch (action.type) {
    case "pick": {
      const from = action.ids.indexOf(action.itemId)
      if (from < 0) return state
      return { mode: action.mode, section: action.section, itemId: action.itemId, ids: action.ids, from, to: from }
    }
    case "move":
      return state && withTarget(state, state.to + action.delta)
    case "over":
      return state && withTarget(state, action.index)
    case "drop":
    case "cancel":
      return null
  }
}

/** New list with the element at `from` moved to `to` (clamped). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length) return [...list]
  const next = [...list]
  const [moved] = next.splice(from, 1)
  next.splice(clamp(to, 0, next.length), 0, moved)
  return next
}

/** The section's order as it would be after dropping now. */
export function previewIds(session: DragSession): string[] {
  return moveItem(session.ids, session.from, session.to)
}

/**
 * Apply a move made in the visible (possibly filtered) list to the full
 * list: visible items are re-dealt into the slots they occupied, hidden items
 * never move. Returns a new array.
 */
export function applyVisibleMove<T extends { id: string }>(
  full: readonly T[],
  visibleIds: readonly string[],
  itemId: string,
  toVisibleIndex: number
): T[] {
  const from = visibleIds.indexOf(itemId)
  if (from < 0) return [...full]
  const reordered = moveItem(visibleIds, from, toVisibleIndex)
  const visible = new Set(visibleIds)
  const byId = new Map(full.map((item) => [item.id, item]))
  let next = 0
  return full.map((item) => {
    if (!visible.has(item.id)) return item
    return byId.get(reordered[next++]) ?? item
  })
}

/** Pointer insertion index: how many of the other rows' vertical midpoints lie above `y`. */
export function insertionIndex(midpoints: readonly number[], y: number): number {
  return midpoints.filter((mid) => mid < y).length
}

/** Distance from a viewport edge where auto-scroll starts (px). */
export const AUTO_SCROLL_EDGE = 72
/** Maximum auto-scroll step per animation frame (px). */
export const AUTO_SCROLL_MAX = 20

/** Scroll step for a pointer at `y` in a viewport of `height`: negative = up, 0 = none. */
export function autoScrollDelta(y: number, height: number, edge = AUTO_SCROLL_EDGE, max = AUTO_SCROLL_MAX): number {
  if (y < edge) return -Math.ceil((max * Math.min(edge, edge - y)) / edge)
  if (y > height - edge) return Math.ceil((max * Math.min(edge, y - (height - edge))) / edge)
  return 0
}
