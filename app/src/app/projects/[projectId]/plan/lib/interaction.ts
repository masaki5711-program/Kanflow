/**
 * Pure interaction rules of the plan: keyboard contracts of bars and grid
 * rows, and the pointer "press" recognizer (mouse drags after a few pixels;
 * touch needs a 300 ms long-press so a normal swipe keeps scrolling).
 */
import { addDays, diffDays } from "./date"
import type { Ymd } from "./plan-types"

export type BarKind = "leaf" | "milestone" | "summary"

export type BarKeyAction = { kind: "open" } | { kind: "move" | "resize"; deltaDays: number }

/**
 * Bar keys (WCAG 2.5.7 alternative to dragging): Enter/Space open the editor,
 * ←/→ move by a day, Shift+←/→ change the end date. Milestones only move;
 * summary bars (derived dates) only open.
 */
export function barKeyAction(key: string, shiftKey: boolean, kind: BarKind): BarKeyAction | null {
  if (key === "Enter" || key === " ") return { kind: "open" }
  if (key !== "ArrowLeft" && key !== "ArrowRight") return null
  if (kind === "summary") return null
  const deltaDays = key === "ArrowLeft" ? -1 : 1
  return { kind: shiftKey && kind === "leaf" ? "resize" : "move", deltaDays }
}

/** Shift a range by whole days; a resize never ends before the start (null = ignore). */
export function shiftRange(start: Ymd, end: Ymd, mode: "move" | "resize", deltaDays: number): { start: Ymd; end: Ymd } | null {
  if (mode === "move") return { start: addDays(start, deltaDays), end: addDays(end, deltaDays) }
  const nextEnd = addDays(end, deltaDays)
  if (diffDays(start, nextEnd) < 0) return null
  return { start, end: nextEnd }
}

export type GridKeyAction = "moveUp" | "moveDown" | "indent" | "outdent" | "rename" | "open"

/** Grid row keys: Alt+↑/↓ reorder, Alt+→/← indent/outdent, F2 rename, Enter opens the editor. */
export function gridKeyAction(e: { key: string; altKey: boolean; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }): GridKeyAction | null {
  if (e.ctrlKey || e.metaKey) return null
  if (e.altKey) {
    if (e.key === "ArrowUp") return "moveUp"
    if (e.key === "ArrowDown") return "moveDown"
    if (e.key === "ArrowRight") return "indent"
    if (e.key === "ArrowLeft") return "outdent"
    return null
  }
  if (e.shiftKey) return null
  if (e.key === "F2") return "rename"
  if (e.key === "Enter") return "open"
  return null
}

export const LONG_PRESS_MS = 300
/** Touch movement tolerated while waiting for the long press. */
export const TOUCH_SLOP_PX = 8
/** Mouse / pen movement that turns a press into a drag (smaller = a click). */
export const MOUSE_DRAG_THRESHOLD_PX = 3

export type PressPhase = "pending" | "dragging" | "cancelled"

export interface PressState {
  phase: PressPhase
  isTouch: boolean
  x0: number
  y0: number
  t0: number
}

export function pressStart(x: number, y: number, t: number, pointerType: string): PressState {
  return { phase: "pending", isTouch: pointerType === "touch", x0: x, y0: y, t0: t }
}

/** A long-press timer tick: a still touch becomes a drag. */
export function pressTimer(s: PressState, t: number): PressState {
  if (s.phase !== "pending" || !s.isTouch || t - s.t0 < LONG_PRESS_MS) return s
  return { ...s, phase: "dragging" }
}

export function pressMove(s: PressState, x: number, y: number, t: number): PressState {
  if (s.phase !== "pending") return s
  const dist = Math.hypot(x - s.x0, y - s.y0)
  if (!s.isTouch) return dist > MOUSE_DRAG_THRESHOLD_PX ? { ...s, phase: "dragging" } : s
  if (t - s.t0 >= LONG_PRESS_MS) return { ...s, phase: "dragging" }
  return dist > TOUCH_SLOP_PX ? { ...s, phase: "cancelled" } : s
}

/** What releasing the pointer means: a tap/click, the end of a drag, or nothing (scroll). */
export function pressEnd(s: PressState): "click" | "drop" | "none" {
  if (s.phase === "dragging") return "drop"
  if (s.phase === "pending") return "click"
  return "none"
}
