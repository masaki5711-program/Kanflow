"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react"
import { announce } from "@/components/live-announcer"
import { useLanguage } from "@/lib/language-context"
import { autoScrollDelta, dragReducer, insertionIndex, type DragAction, type DragSession, type DragState } from "./reorder"
import type { BacklogStatus } from "./types"

/** Attribute on each draggable row (`<li data-dnd-row={id}>`) of a section list. */
export const DND_ROW_ATTR = "data-dnd-row"
/** Attribute on each drag handle (`data-drag-handle={id}`), used to keep focus on it. */
export const DND_HANDLE_ATTR = "data-drag-handle"

export interface DragTarget {
  section: BacklogStatus
  itemId: string
  displayId: number
  /** Visible ids of the section, in order. */
  ids: readonly string[]
}

export interface ReorderDnd {
  drag: DragState
  onHandleKeyDown: (e: KeyboardEvent<HTMLElement>, target: DragTarget) => void
  onHandlePointerDown: (e: PointerEvent<HTMLElement>, target: DragTarget, list: HTMLElement | null) => void
  onHandleBlur: () => void
}

function fill(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), template)
}

/**
 * Drag & drop reordering of backlog sections.
 * - Pointer: press the handle, move (drop indicator, auto-scroll near the
 *   viewport edges), release to drop; Esc cancels.
 * - Keyboard: focus the handle, Space/Enter picks up, ↑/↓ move (live preview),
 *   Space/Enter drops, Esc cancels. Every step is announced.
 * `onCommit(section, itemId, toIndex)` receives the index in the visible list.
 */
export function useReorderDnd(onCommit: (section: BacklogStatus, itemId: string, toIndex: number) => void): ReorderDnd {
  const { t } = useLanguage()
  const [drag, setDrag] = useState<DragState>(null)
  const dragRef = useRef<DragState>(null)
  const displayIdRef = useRef(0)
  const cleanupRef = useRef<(() => void) | null>(null)
  const onCommitRef = useRef(onCommit)
  useEffect(() => {
    onCommitRef.current = onCommit
  })

  const apply = useCallback((action: DragAction): DragState => {
    const next = dragReducer(dragRef.current, action)
    dragRef.current = next
    setDrag(next)
    return next
  }, [])

  const say = useCallback(
    (template: string, s: DragSession, pos: number) => announce(fill(template, { id: displayIdRef.current, pos: pos + 1, total: s.ids.length })),
    [],
  )

  const finish = useCallback(
    (commit: boolean) => {
      const session = dragRef.current
      cleanupRef.current?.()
      cleanupRef.current = null
      if (!session) return
      apply({ type: commit ? "drop" : "cancel" })
      if (commit && session.to !== session.from) onCommitRef.current(session.section, session.itemId, session.to)
      else if (!commit || session.mode === "keyboard") say(t.backlogDragCancelled, session, session.from)
    },
    [apply, say, t],
  )

  // Keyboard preview re-orders the rows; keep focus on the moved item's handle.
  useLayoutEffect(() => {
    if (drag?.mode !== "keyboard") return
    const handle = document.querySelector<HTMLElement>(`[${DND_HANDLE_ATTR}="${drag.itemId}"]`)
    if (handle && document.activeElement !== handle) handle.focus()
  }, [drag])

  useEffect(() => () => cleanupRef.current?.(), [])

  const onHandleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>, target: DragTarget) => {
      const session = dragRef.current
      const active = session?.itemId === target.itemId && session.mode === "keyboard" ? session : null
      const isToggle = e.key === " " || e.key === "Enter"
      if (!active) {
        if (!isToggle) return
        e.preventDefault()
        displayIdRef.current = target.displayId
        const next = apply({ type: "pick", mode: "keyboard", section: target.section, itemId: target.itemId, ids: target.ids })
        if (next) say(t.backlogDragPicked, next, next.from)
        return
      }
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault()
        const next = apply({ type: "move", delta: e.key === "ArrowUp" ? -1 : 1 })
        if (next) say(t.backlogDragMoved, next, next.to)
      } else if (isToggle) {
        e.preventDefault()
        finish(true)
      } else if (e.key === "Escape") {
        // Do not let Escape also close a surrounding dialog.
        e.preventDefault()
        e.stopPropagation()
        finish(false)
      }
    },
    [apply, finish, say, t],
  )

  const onHandleBlur = useCallback(() => {
    // Focus left the handle for good (click elsewhere, Tab): cancel a keyboard drag.
    window.setTimeout(() => {
      const session = dragRef.current
      if (session?.mode !== "keyboard") return
      const handle = document.querySelector(`[${DND_HANDLE_ATTR}="${session.itemId}"]`)
      if (document.activeElement !== handle) finish(false)
    }, 0)
  }, [finish])

  const onHandlePointerDown = useCallback(
    (e: PointerEvent<HTMLElement>, target: DragTarget, list: HTMLElement | null) => {
      if (e.button !== 0 || !list) return
      e.preventDefault()
      cleanupRef.current?.()
      displayIdRef.current = target.displayId
      if (!apply({ type: "pick", mode: "pointer", section: target.section, itemId: target.itemId, ids: target.ids })) return
      cleanupRef.current = startPointerSession(list, target.itemId, e.clientY, (index) => apply({ type: "over", index }), finish)
    },
    [apply, finish],
  )

  return { drag, onHandleKeyDown, onHandlePointerDown, onHandleBlur }
}

/**
 * Window listeners + auto-scroll loop of one pointer drag. Returns the cleanup.
 * `over(index)` gets the insertion index among the other rows of `list`.
 */
function startPointerSession(
  list: HTMLElement,
  itemId: string,
  startY: number,
  over: (index: number) => void,
  finish: (commit: boolean) => void,
): () => void {
  let y = startY
  let frame = 0

  const update = () => {
    const rows = Array.from(list.querySelectorAll<HTMLElement>(`[${DND_ROW_ATTR}]`)).filter((r) => r.getAttribute(DND_ROW_ATTR) !== itemId)
    const mids = rows.map((r) => {
      const rect = r.getBoundingClientRect()
      return rect.top + rect.height / 2
    })
    over(insertionIndex(mids, y))
  }
  const tick = () => {
    const delta = autoScrollDelta(y, window.innerHeight)
    if (delta !== 0) {
      window.scrollBy(0, delta)
      update()
    }
    frame = window.requestAnimationFrame(tick)
  }
  const onMove = (ev: globalThis.PointerEvent) => {
    y = ev.clientY
    update()
  }
  const onUp = () => finish(true)
  const onCancel = () => finish(false)
  const onKey = (ev: globalThis.KeyboardEvent) => {
    if (ev.key !== "Escape") return
    ev.preventDefault()
    ev.stopPropagation()
    finish(false)
  }

  window.addEventListener("pointermove", onMove)
  window.addEventListener("pointerup", onUp)
  window.addEventListener("pointercancel", onCancel)
  window.addEventListener("keydown", onKey, true)
  frame = window.requestAnimationFrame(tick)
  return () => {
    window.cancelAnimationFrame(frame)
    window.removeEventListener("pointermove", onMove)
    window.removeEventListener("pointerup", onUp)
    window.removeEventListener("pointercancel", onCancel)
    window.removeEventListener("keydown", onKey, true)
  }
}
