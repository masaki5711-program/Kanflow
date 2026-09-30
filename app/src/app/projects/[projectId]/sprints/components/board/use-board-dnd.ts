"use client"

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react"
import { dndReducer, dropResultOf, IDLE, type DndAction, type DndState, type DropResult } from "./board-dnd-reducer"
import type { BoardStatus } from "./board-model"

export type DndEvent =
  | { type: "pickUp"; taskId: string; status: BoardStatus }
  | { type: "over"; taskId: string; status: BoardStatus }
  | { type: "cancel"; taskId: string }

export interface DropTarget {
  status: BoardStatus
  laneKey: string
}

interface Options {
  /** Board root: only drop targets inside it count (one board per sprint card). */
  rootRef: RefObject<HTMLElement | null>
  onDrop: (result: DropResult) => void
  /** Screen-reader feedback for keyboard drags. */
  onAnnounce?: (event: DndEvent) => void
}

const DROP_SELECTOR = "[data-board-drop]"
/** Presses on these never start a drag (they have their own action). */
const CONTROL_SELECTOR = "button, a, input, select, textarea, [data-card-control]"

/** Column cell under a viewport point, limited to `root`. */
export function hitTestDropTarget(root: HTMLElement | null, x: number, y: number): DropTarget | null {
  if (!root || typeof document.elementFromPoint !== "function") return null
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>(DROP_SELECTOR)
  if (!el || !root.contains(el)) return null
  const status = el.dataset.boardStatus as BoardStatus | undefined
  return status ? { status, laneKey: el.dataset.boardLane ?? "" } : null
}

function isKeyboardDragOf(state: DndState, taskId: string): boolean {
  return state.phase === "dragging" && state.source === "keyboard" && state.taskId === taskId
}

/**
 * Drag & drop for the sprint board.
 * - Mouse / pen: press a card and move past the threshold; the card follows
 *   the pointer (transform only) and the column under it is highlighted.
 *   Touch does not drag (it scrolls); touch users use the card's move menu.
 * - Keyboard: Space picks the focused card up, ←/→ choose the column,
 *   Space/Enter drop, Escape (or Tab away) cancels.
 */
export function useBoardDnd({ rootRef, onDrop, onAnnounce }: Options) {
  const [state, setState] = useState<DndState>(IDLE)
  const stateRef = useRef<DndState>(IDLE)
  const suppressClickRef = useRef(false)
  const callbacksRef = useRef({ onDrop, onAnnounce })
  useEffect(() => {
    callbacksRef.current = { onDrop, onAnnounce }
  })

  const apply = useCallback((action: DndAction): DndState => {
    const next = dndReducer(stateRef.current, action)
    if (next !== stateRef.current) {
      stateRef.current = next
      setState(next)
    }
    return next
  }, [])

  const finish = useCallback(() => {
    const result = dropResultOf(stateRef.current)
    apply({ type: "reset" })
    if (result) callbacksRef.current.onDrop(result)
    return result
  }, [apply])

  const isPointerActive = state.phase === "pending" || (state.phase === "dragging" && state.source === "pointer")
  useEffect(() => {
    if (!isPointerActive) return
    const onMove = (e: PointerEvent) => {
      const hit = hitTestDropTarget(rootRef.current, e.clientX, e.clientY)
      apply({ type: "pointerMove", x: e.clientX, y: e.clientY, over: hit?.status ?? null, overLane: hit?.laneKey ?? null })
    }
    const onUp = () => {
      if (stateRef.current.phase !== "dragging") {
        apply({ type: "reset" })
        return
      }
      // The click that follows a drag must not open the task.
      suppressClickRef.current = true
      window.setTimeout(() => { suppressClickRef.current = false }, 0)
      finish()
    }
    const onCancel = () => apply({ type: "cancel" })
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return
      e.preventDefault()
      apply({ type: "cancel" })
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onCancel)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onCancel)
      window.removeEventListener("keydown", onKey)
    }
  }, [isPointerActive, apply, finish, rootRef])

  const onCardPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>, taskId: string, from: BoardStatus, laneKey: string) => {
      if (e.button !== 0 || e.pointerType === "touch") return
      const target = e.target as HTMLElement
      if (target !== e.currentTarget && target.closest(CONTROL_SELECTOR)) return
      apply({ type: "pointerDown", taskId, from, laneKey, x: e.clientX, y: e.clientY })
    },
    [apply],
  )

  /** Keyboard drag keys of a focused card. Returns true when the key was handled. */
  const onCardKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>, taskId: string, from: BoardStatus, laneKey: string): boolean => {
      if (e.target !== e.currentTarget) return false
      const current = stateRef.current
      if (!isKeyboardDragOf(current, taskId)) {
        if (e.key !== " " || current.phase !== "idle") return false
        e.preventDefault()
        apply({ type: "keyboardPickUp", taskId, from, laneKey })
        callbacksRef.current.onAnnounce?.({ type: "pickUp", taskId, status: from })
        return true
      }
      switch (e.key) {
        case "ArrowLeft":
        case "ArrowRight": {
          e.preventDefault()
          const next = apply({ type: "keyboardMove", delta: e.key === "ArrowLeft" ? -1 : 1 })
          if (next.phase === "dragging" && next.over) callbacksRef.current.onAnnounce?.({ type: "over", taskId, status: next.over })
          return true
        }
        case "ArrowUp":
        case "ArrowDown":
          e.preventDefault()
          return true
        case " ":
        case "Enter": {
          e.preventDefault()
          if (!finish()) callbacksRef.current.onAnnounce?.({ type: "cancel", taskId })
          return true
        }
        case "Escape":
          e.preventDefault()
          e.stopPropagation()
          apply({ type: "cancel" })
          callbacksRef.current.onAnnounce?.({ type: "cancel", taskId })
          return true
        default:
          return false
      }
    },
    [apply, finish],
  )

  /** Focus left a lifted card (Tab, click elsewhere): cancel the keyboard drag. */
  const onCardBlur = useCallback(
    (taskId: string) => {
      if (!isKeyboardDragOf(stateRef.current, taskId)) return
      apply({ type: "cancel" })
      callbacksRef.current.onAnnounce?.({ type: "cancel", taskId })
    },
    [apply],
  )

  /** True (once) when the current click is the tail of a pointer drag. */
  const consumeDragClick = useCallback(() => {
    const suppressed = suppressClickRef.current
    suppressClickRef.current = false
    return suppressed
  }, [])

  return { state, onCardPointerDown, onCardKeyDown, onCardBlur, consumeDragClick }
}

export type BoardDnd = ReturnType<typeof useBoardDnd>
