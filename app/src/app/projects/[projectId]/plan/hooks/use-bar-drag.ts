"use client"

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react"
import { useStableHandlers } from "@/hooks"
import { addDays } from "../lib/date"
import {
  LONG_PRESS_MS,
  barKeyAction,
  pressEnd,
  pressMove,
  pressStart,
  pressTimer,
  shiftRange,
  type BarKind,
  type PressState,
} from "../lib/interaction"
import type { PlanItem, Ymd } from "../lib/plan-types"

/** Keyboard nudges are persisted once the user pauses (one PATCH per burst). */
export const KEYBOARD_COMMIT_DELAY_MS = 600

export interface LiveEdit {
  id: string
  start: Ymd
  end: Ymd
}

interface DragSession {
  item: PlanItem
  mode: "move" | "resize"
  press: PressState
  timer: ReturnType<typeof setTimeout> | null
  latest: LiveEdit
  moved: boolean
  target: HTMLElement
  pointerId: number
}

interface Options {
  dayWidth: number
  canEdit: boolean
  onPreview: (id: string, start: Ymd, end: Ymd) => void
  onCommit: (item: PlanItem, start: Ymd, end: Ymd) => void
}

function rangeFor(item: PlanItem, mode: "move" | "resize", deltaDays: number): { start: Ymd; end: Ymd } {
  if (mode === "move") return { start: addDays(item.plannedStart, deltaDays), end: addDays(item.plannedEnd, deltaDays) }
  return shiftRange(item.plannedStart, item.plannedEnd, "resize", deltaDays) ?? { start: item.plannedStart, end: item.plannedStart }
}

/**
 * Move / resize of timeline bars by pointer or keyboard, snapped to days.
 * Mouse drags start after a few pixels; touch needs a 300 ms long-press so a
 * normal swipe keeps scrolling the timeline. `live` drives the date tooltip.
 */
export function useBarDrag({ dayWidth, canEdit, onPreview, onCommit }: Options) {
  const sessionRef = useRef<DragSession | null>(null)
  const pendingKeyRef = useRef<{ item: PlanItem; edit: LiveEdit; timer: ReturnType<typeof setTimeout> } | null>(null)
  const suppressClickRef = useRef(false)
  const [live, setLive] = useState<LiveEdit | null>(null)

  const preview = useCallback(
    (edit: LiveEdit) => {
      setLive(edit)
      onPreview(edit.id, edit.start, edit.end)
    },
    [onPreview],
  )

  const flushKeyEdit = useCallback(() => {
    const pending = pendingKeyRef.current
    if (!pending) return
    pendingKeyRef.current = null
    clearTimeout(pending.timer)
    setLive(null)
    onCommit(pending.item, pending.edit.start, pending.edit.end)
  }, [onCommit])

  // Never lose a pending keyboard edit when the timeline unmounts.
  const flushRef = useRef(flushKeyEdit)
  useEffect(() => {
    flushRef.current = flushKeyEdit
  })
  useEffect(() => () => flushRef.current(), [])

  function onKeyDown(e: KeyboardEvent, item: PlanItem, kind: BarKind, onOpen: (item: PlanItem) => void) {
    const action = barKeyAction(e.key, e.shiftKey, kind)
    if (!action) return
    e.preventDefault()
    if (action.kind === "open") {
      flushKeyEdit()
      onOpen(item)
      return
    }
    if (!canEdit) return
    const pending = pendingKeyRef.current?.item.id === item.id ? pendingKeyRef.current : null
    if (!pending) flushKeyEdit()
    const from = pending?.edit ?? { id: item.id, start: item.plannedStart, end: item.plannedEnd }
    const next = shiftRange(from.start, from.end, action.kind, action.deltaDays)
    if (!next) return
    if (pending) clearTimeout(pending.timer)
    const edit = { id: item.id, ...next }
    pendingKeyRef.current = { item: pending?.item ?? item, edit, timer: setTimeout(flushKeyEdit, KEYBOARD_COMMIT_DELAY_MS) }
    preview(edit)
  }

  function startDragging(s: DragSession) {
    if (!s.target.hasPointerCapture?.(s.pointerId)) s.target.setPointerCapture?.(s.pointerId)
  }

  function onPointerDown(e: PointerEvent, item: PlanItem, kind: BarKind, mode: "move" | "resize") {
    if (!canEdit || kind === "summary" || e.button > 0) return
    e.stopPropagation()
    const pointerType = e.pointerType || "mouse"
    const target = e.currentTarget as HTMLElement
    const press = pressStart(e.clientX, e.clientY, e.timeStamp, pointerType)
    const session: DragSession = {
      item,
      mode: kind === "milestone" ? "move" : mode,
      press,
      timer: null,
      latest: { id: item.id, start: item.plannedStart, end: item.plannedEnd },
      moved: false,
      target,
      pointerId: e.pointerId,
    }
    sessionRef.current = session
    if (press.isTouch) {
      session.timer = setTimeout(() => {
        const s = sessionRef.current
        if (!s) return
        s.press = pressTimer(s.press, s.press.t0 + LONG_PRESS_MS)
        if (s.press.phase === "dragging") {
          startDragging(s)
          setLive(s.latest)
        }
      }, LONG_PRESS_MS)
    } else {
      e.preventDefault()
      target.setPointerCapture?.(e.pointerId)
    }
  }

  function onPointerMove(e: PointerEvent) {
    const s = sessionRef.current
    if (!s) return
    const before = s.press.phase
    s.press = pressMove(s.press, e.clientX, e.clientY, e.timeStamp)
    if (s.press.phase === "cancelled") {
      end()
      return
    }
    if (s.press.phase !== "dragging") return
    if (before !== "dragging") {
      startDragging(s)
      setLive(s.latest)
    }
    const delta = Math.round((e.clientX - s.press.x0) / dayWidth)
    const next = rangeFor(s.item, s.mode, delta)
    if (next.start === s.latest.start && next.end === s.latest.end) return
    s.latest = { id: s.item.id, ...next }
    s.moved = true
    preview(s.latest)
  }

  function end() {
    const s = sessionRef.current
    if (!s) return
    sessionRef.current = null
    if (s.timer) clearTimeout(s.timer)
    if (s.target.hasPointerCapture?.(s.pointerId)) s.target.releasePointerCapture?.(s.pointerId)
    setLive(null)
  }

  function onPointerUp() {
    const s = sessionRef.current
    if (!s) return
    const result = pressEnd(s.press)
    end()
    if (result !== "drop") return
    suppressClickRef.current = true
    if (s.moved) onCommit(s.item, s.latest.start, s.latest.end)
  }

  function onPointerCancel() {
    const s = sessionRef.current
    if (!s) return
    end()
    // The browser took over (e.g. scrolling): put the bar back.
    if (s.moved) onPreview(s.item.id, s.item.plannedStart, s.item.plannedEnd)
  }

  /** True once after a drag ended, so the trailing click does not also select/open. */
  function consumeClickSuppression(): boolean {
    const v = suppressClickRef.current
    suppressClickRef.current = false
    return v
  }

  function isDragging(): boolean {
    return sessionRef.current?.press.phase === "dragging"
  }

  // Stable identities so memoized bars do not re-render on every parent render.
  const handlers = useStableHandlers({
    onKeyDown,
    onBlur: flushKeyEdit,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    consumeClickSuppression,
    isDragging,
  })
  return { live, handlers }
}

export type BarDrag = ReturnType<typeof useBarDrag>["handlers"]
