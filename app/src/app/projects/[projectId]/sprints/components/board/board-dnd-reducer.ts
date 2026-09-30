// Pure drag & drop state machine of the sprint board (pointer + keyboard).
// The React wiring lives in use-board-dnd.ts.
import { BOARD_STATUSES, type BoardStatus } from "./board-model"

/** Pointer travel (px) before a press becomes a drag; below it the press is a click. */
export const DRAG_THRESHOLD_PX = 5

export type DndState =
  | { phase: "idle" }
  | { phase: "pending"; taskId: string; from: BoardStatus; laneKey: string; startX: number; startY: number }
  | {
      phase: "dragging"
      source: "pointer" | "keyboard"
      taskId: string
      from: BoardStatus
      /** Column under the pointer / keyboard cursor (null = outside the board). */
      over: BoardStatus | null
      overLane: string | null
      startX: number
      startY: number
      /** Pointer offset from the press point (always 0 for keyboard drags). */
      dx: number
      dy: number
    }

export type DndAction =
  | { type: "pointerDown"; taskId: string; from: BoardStatus; laneKey: string; x: number; y: number }
  | { type: "pointerMove"; x: number; y: number; over: BoardStatus | null; overLane: string | null }
  | { type: "keyboardPickUp"; taskId: string; from: BoardStatus; laneKey: string }
  | { type: "keyboardMove"; delta: -1 | 1 }
  | { type: "cancel" }
  | { type: "reset" }

export const IDLE: DndState = { phase: "idle" }

export interface DropResult {
  taskId: string
  from: BoardStatus
  to: BoardStatus
}

function pointerMove(state: DndState, action: Extract<DndAction, { type: "pointerMove" }>): DndState {
  if (state.phase === "idle") return state
  if (state.phase === "dragging" && state.source === "keyboard") return state
  const dx = action.x - state.startX
  const dy = action.y - state.startY
  if (state.phase === "pending" && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return state
  return {
    phase: "dragging", source: "pointer", taskId: state.taskId, from: state.from,
    over: action.over, overLane: action.overLane, startX: state.startX, startY: state.startY, dx, dy,
  }
}

function keyboardMove(state: DndState, delta: -1 | 1): DndState {
  if (state.phase !== "dragging" || state.source !== "keyboard") return state
  const index = BOARD_STATUSES.indexOf(state.over ?? state.from)
  const next = Math.min(BOARD_STATUSES.length - 1, Math.max(0, index + delta))
  return { ...state, over: BOARD_STATUSES[next] }
}

export function dndReducer(state: DndState, action: DndAction): DndState {
  switch (action.type) {
    case "pointerDown":
      if (state.phase !== "idle") return state
      return { phase: "pending", taskId: action.taskId, from: action.from, laneKey: action.laneKey, startX: action.x, startY: action.y }
    case "pointerMove":
      return pointerMove(state, action)
    case "keyboardPickUp":
      if (state.phase !== "idle") return state
      return {
        phase: "dragging", source: "keyboard", taskId: action.taskId, from: action.from,
        over: action.from, overLane: action.laneKey, startX: 0, startY: 0, dx: 0, dy: 0,
      }
    case "keyboardMove":
      return keyboardMove(state, action.delta)
    case "cancel":
    case "reset":
      return IDLE
  }
}

/** What a drop in this state would do; null when nothing would change. */
export function dropResultOf(state: DndState): DropResult | null {
  if (state.phase !== "dragging" || state.over === null || state.over === state.from) return null
  return { taskId: state.taskId, from: state.from, to: state.over }
}
