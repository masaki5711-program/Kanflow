"use client"

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react"
import { successorBlocks, type SuccessorBlock } from "../lib/dependency-rules"
import { ROW_HEIGHT } from "../lib/geometry"
import type { PlanDependency, PlanItem } from "../lib/plan-types"

/** Live state of a drag from a bar's connector to the bar that should follow it. */
export interface LinkDrag {
  sourceId: string
  /** Pointer position in timeline coordinates (px from the timeline's left / the first row's top). */
  x: number
  y: number
  /** Row under the pointer (null outside the rows or over the source itself). */
  targetId: string | null
  /** Why the target cannot follow the source (null = it can). */
  block: Exclude<SuccessorBlock, "self"> | null
}

interface Options {
  /** Rows container (its top edge is row 0). */
  getBody: () => HTMLElement | null
  /** The scroll box (auto-scrolls when the pointer nears its edges). */
  getScroller: () => HTMLElement | null
  /** Width of the sticky grid column left of the timeline. */
  gridWidth: number
  /** Visible row ids in display order. */
  rowIds: readonly string[]
  items: readonly PlanItem[]
  dependencies: readonly PlanDependency[]
  /** Dropped on a valid target: create predecessor → successor. */
  onLink: (predecessorId: string, successorId: string) => void
  /** Dropped on a target that cannot follow (the reason is shown). */
  onRejected: (block: Exclude<SuccessorBlock, "self">) => void
}

/** Distance from the scroll box edge where dragging scrolls it (px) and the step per move. */
const EDGE = 32
const STEP = 16

function edgeStep(pos: number, start: number, end: number): number {
  if (pos < start + EDGE) return -STEP
  if (pos > end - EDGE) return STEP
  return 0
}

/**
 * Drag from the ● at a bar's end and drop on another bar to add a
 * finish-to-start dependency. The pointer is tracked on the window; Esc or
 * pointercancel aborts. Targets are checked with the same rules as the
 * successor picker, so the server never has to reject a drop.
 */
export function useLinkDrag(options: Options) {
  const [link, setLink] = useState<LinkDrag | null>(null)
  const optsRef = useRef(options)
  useEffect(() => {
    optsRef.current = options
  })
  const cleanupRef = useRef<(() => void) | null>(null)
  useEffect(() => () => cleanupRef.current?.(), [])

  const onConnectorPointerDown = useCallback((e: PointerEvent<HTMLElement>, sourceId: string) => {
    if (e.button > 0) return
    e.preventDefault()
    e.stopPropagation()
    const { items, dependencies } = optsRef.current
    const blocks = successorBlocks(items, dependencies, sourceId)
    let current: LinkDrag | null = null

    const at = (clientX: number, clientY: number): LinkDrag | null => {
      const { getBody, gridWidth, rowIds } = optsRef.current
      const body = getBody()
      if (!body) return null
      const rect = body.getBoundingClientRect()
      const x = clientX - rect.left - gridWidth
      const y = clientY - rect.top
      const idx = Math.floor(y / ROW_HEIGHT)
      const rowId = x >= 0 && idx >= 0 && idx < rowIds.length ? rowIds[idx] : null
      const targetId = rowId === sourceId ? null : rowId
      const block = targetId ? blocks.get(targetId) : undefined
      return { sourceId, x, y, targetId, block: block && block !== "self" ? block : null }
    }
    const move = (ev: globalThis.PointerEvent) => {
      const scroller = optsRef.current.getScroller()
      if (scroller) {
        const r = scroller.getBoundingClientRect()
        const dx = edgeStep(ev.clientX, r.left + optsRef.current.gridWidth, r.right)
        const dy = edgeStep(ev.clientY, r.top, r.bottom)
        if (dx || dy) scroller.scrollBy(dx, dy)
      }
      current = at(ev.clientX, ev.clientY)
      setLink(current)
    }
    const finish = (commit: boolean) => {
      cleanupRef.current?.()
      setLink(null)
      if (!commit || !current?.targetId) return
      if (current.block) optsRef.current.onRejected(current.block)
      else optsRef.current.onLink(sourceId, current.targetId)
    }
    const up = () => finish(true)
    const cancel = () => finish(false)
    const key = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.preventDefault()
        finish(false)
      }
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", cancel)
    window.addEventListener("keydown", key)
    cleanupRef.current = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", cancel)
      window.removeEventListener("keydown", key)
      cleanupRef.current = null
    }
    current = at(e.clientX, e.clientY)
    setLink(current)
  }, [])

  return { link, onConnectorPointerDown }
}
