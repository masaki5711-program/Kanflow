"use client"

import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from "react"
import { addDays, barKeyAction, formatYmd, shiftPlanDates, type PlanItem } from "./lib/plan-utils"

/** Keyboard nudges are persisted once the user pauses (one PATCH per burst). */
export const KEYBOARD_COMMIT_DELAY_MS = 600

interface PendingKeyEdit {
  id: string
  start: Date
  end: Date
  timer: ReturnType<typeof setTimeout>
}

interface DragState {
  id: string
  mode: "move" | "resize"
  startX: number
  initialStart: Date
  initialEnd: Date
  latestStart: Date
  latestEnd: Date
  moved: boolean
}

interface BarDragOptions {
  dayWidth: number
  canEdit: boolean
  /** Local preview while dragging. */
  onPreview: (id: string, plannedStart: string, plannedEnd: string) => void
  /** Persist the final dates on release (only called when the bar actually moved). */
  onCommit: (id: string, plannedStart: string, plannedEnd: string) => void
}

/**
 * Move / resize of timeline bars, by pointer (drag) or keyboard (arrow keys,
 * see barKeyAction). Dates snap to whole days. Both paths preview locally
 * and persist through the same onCommit.
 */
export function useBarDrag({ dayWidth, canEdit, onPreview, onCommit }: BarDragOptions) {
  const dragRef = useRef<DragState | null>(null)
  const pendingKeyRef = useRef<PendingKeyEdit | null>(null)

  function flushKeyEdit() {
    const pending = pendingKeyRef.current
    if (!pending) return
    pendingKeyRef.current = null
    clearTimeout(pending.timer)
    onCommit(pending.id, formatYmd(pending.start), formatYmd(pending.end))
  }

  // Never lose a pending keyboard edit when the timeline unmounts.
  const flushRef = useRef(flushKeyEdit)
  useEffect(() => {
    flushRef.current = flushKeyEdit
  })
  useEffect(() => () => flushRef.current(), [])

  /** Keyboard handler for a bar. Returns nothing; prevents default for handled keys. */
  function onKeyDown(e: KeyboardEvent, item: PlanItem, onOpen: (item: PlanItem) => void) {
    const action = barKeyAction(e.key, e.shiftKey)
    if (!action) return
    e.preventDefault()
    if (action.kind === "open") {
      flushKeyEdit()
      onOpen(item)
      return
    }
    if (!canEdit || item.isMilestone) return
    const pending = pendingKeyRef.current?.id === item.id ? pendingKeyRef.current : null
    if (!pending) flushKeyEdit()
    const base = pending ?? { start: new Date(item.plannedStart), end: new Date(item.plannedEnd) }
    const next = shiftPlanDates(base.start, base.end, action.kind, action.deltaDays)
    if (!next) return
    if (pending) clearTimeout(pending.timer)
    pendingKeyRef.current = {
      id: item.id,
      start: next.start,
      end: next.end,
      timer: setTimeout(flushKeyEdit, KEYBOARD_COMMIT_DELAY_MS),
    }
    onPreview(item.id, next.start.toISOString(), next.end.toISOString())
  }

  function onPointerDown(e: PointerEvent, item: PlanItem, mode: "move" | "resize") {
    if (!canEdit || item.isMilestone) return
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    const initialStart = new Date(item.plannedStart)
    const initialEnd = new Date(item.plannedEnd)
    dragRef.current = {
      id: item.id,
      mode,
      startX: e.clientX,
      initialStart,
      initialEnd,
      latestStart: initialStart,
      latestEnd: initialEnd,
      moved: false,
    }
  }

  function onPointerMove(e: PointerEvent) {
    const drag = dragRef.current
    if (!drag) return
    const deltaDays = Math.round((e.clientX - drag.startX) / dayWidth)
    let start = drag.initialStart
    let end = addDays(drag.initialEnd, deltaDays)
    if (drag.mode === "move") {
      start = addDays(drag.initialStart, deltaDays)
    } else if (end.getTime() <= drag.initialStart.getTime()) {
      // Resize never lets the end cross the start.
      end = drag.latestEnd
    }
    if (start.getTime() === drag.latestStart.getTime() && end.getTime() === drag.latestEnd.getTime()) return
    drag.latestStart = start
    drag.latestEnd = end
    drag.moved = true
    onPreview(drag.id, start.toISOString(), end.toISOString())
  }

  function onPointerUp(e: PointerEvent) {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    const target = e.target as HTMLElement
    if (target.hasPointerCapture?.(e.pointerId)) target.releasePointerCapture(e.pointerId)
    if (drag.moved) onCommit(drag.id, formatYmd(drag.latestStart), formatYmd(drag.latestEnd))
  }

  return { onPointerDown, onPointerMove, onPointerUp, onKeyDown, onBlur: flushKeyEdit }
}
