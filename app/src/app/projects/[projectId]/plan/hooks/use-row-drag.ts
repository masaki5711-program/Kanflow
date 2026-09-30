"use client"

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react"
import { dropTargetAt } from "../lib/filter"
import { ROW_HEIGHT } from "../lib/geometry"

export interface RowDropTarget {
  targetId: string
  position: "before" | "after"
}

interface Options {
  /** Rows container (its top edge is row 0). */
  getBody: () => HTMLElement | null
  /** Visible row ids in display order. */
  rowIds: readonly string[]
  onDrop: (dragId: string, target: RowDropTarget) => void
}

/**
 * Reorder grid rows by dragging the handle. The pointer is tracked on the
 * window so leaving the handle does not end the drag; the drop indicator
 * follows the row half under the pointer. Keyboard users use Alt+↑/↓ instead.
 */
export function useRowDrag({ getBody, rowIds, onDrop }: Options) {
  const [target, setTarget] = useState<RowDropTarget | null>(null)
  const optsRef = useRef({ getBody, rowIds, onDrop })
  useEffect(() => {
    optsRef.current = { getBody, rowIds, onDrop }
  })
  const cleanupRef = useRef<(() => void) | null>(null)
  useEffect(() => () => cleanupRef.current?.(), [])

  const onHandlePointerDown = useCallback((e: PointerEvent<HTMLElement>, dragId: string) => {
    if (e.button > 0) return
    e.preventDefault()
    let current: RowDropTarget | null = null
    const at = (clientY: number) => {
      const body = optsRef.current.getBody()
      if (!body) return null
      return dropTargetAt(clientY - body.getBoundingClientRect().top, optsRef.current.rowIds, ROW_HEIGHT)
    }
    const move = (ev: globalThis.PointerEvent) => {
      current = at(ev.clientY)
      setTarget(current)
    }
    const finish = (commit: boolean) => {
      cleanupRef.current?.()
      setTarget(null)
      if (commit && current && current.targetId !== dragId) optsRef.current.onDrop(dragId, current)
    }
    const up = () => finish(true)
    const cancel = () => finish(false)
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", cancel)
    cleanupRef.current = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", cancel)
      cleanupRef.current = null
    }
  }, [])

  return { target, onHandlePointerDown }
}
