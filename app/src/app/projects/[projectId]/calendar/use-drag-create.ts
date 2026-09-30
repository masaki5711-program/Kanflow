"use client"

import { useRef, useState } from "react"

/**
 * Mouse drag across month-grid days to create a multi-day event.
 * Keyboard users get the same result via the per-day "add" button + the
 * date fields of the event dialog.
 */
export function useDragCreate(enabled: boolean, onCreateRange: (start: string, end: string) => void) {
  const [dragStart, setDragStart] = useState<string | null>(null)
  const [dragEnd, setDragEnd] = useState<string | null>(null)
  const isDragging = useRef(false)

  function reset() {
    isDragging.current = false
    setDragStart(null)
    setDragEnd(null)
  }

  function onDayMouseDown(dayStr: string) {
    if (!enabled) return
    isDragging.current = true
    setDragStart(dayStr)
    setDragEnd(dayStr)
  }

  function onDayMouseEnter(dayStr: string) {
    if (isDragging.current) setDragEnd(dayStr)
  }

  function onMouseUp() {
    const wasDragging = isDragging.current
    const s = dragStart
    const e = dragEnd
    reset()
    if (!wasDragging || !s || !e) return
    const start = s < e ? s : e
    const end = s < e ? e : s
    if (start !== end) onCreateRange(start, end)
  }

  function onMouseLeave() {
    if (isDragging.current) reset()
  }

  function isDayInDragRange(dayStr: string): boolean {
    if (!dragStart || !dragEnd) return false
    const s = dragStart < dragEnd ? dragStart : dragEnd
    const e = dragStart < dragEnd ? dragEnd : dragStart
    return dayStr >= s && dayStr <= e
  }

  const isMultiDayDrag = !!dragStart && !!dragEnd && dragStart !== dragEnd

  return { dragStart, isMultiDayDrag, onDayMouseDown, onDayMouseEnter, onMouseUp, onMouseLeave, isDayInDragRange }
}
