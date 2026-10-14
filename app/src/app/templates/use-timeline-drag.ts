"use client"

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react"
import { linkBlock, type RefusedLink, type TemplateLink } from "@/lib/plan-templates/links"
import { TEMPLATE_DURATION_MAX } from "@/lib/plan-templates/schema"
import type { EditorNode } from "./lib/editor-state"

/** Live state of a drag from a bar's ● to the stage that should follow it. */
export interface LinkDrag {
  sourceKey: string
  /** Pointer position in bar-area coordinates (px from its left / the first row's top). */
  x: number
  y: number
  targetKey: string | null
  /** Why the target cannot follow the source (null = it can). */
  block: RefusedLink | null
}

interface LinkOptions {
  /** The bar area; its top edge is row 0 (the day header sits outside it). */
  getBody: () => HTMLElement | null
  rowKeys: readonly string[]
  rowHeight: number
  stages: readonly EditorNode[]
  links: readonly TemplateLink[]
  onLink: (link: TemplateLink) => void
  onRejected: (block: RefusedLink) => void
}

/**
 * Drag from the ● at a bar's end and drop on another stage's row to add a
 * finish-to-start dependency. The pointer is tracked on the window; Esc or
 * pointercancel aborts. Targets are checked with the template's own link
 * rules, so a drop never produces a link the server would reject.
 */
export function useLinkDrag(options: LinkOptions) {
  const [drag, setDrag] = useState<LinkDrag | null>(null)
  const optsRef = useRef(options)
  useEffect(() => {
    optsRef.current = options
  })
  const cleanupRef = useRef<(() => void) | null>(null)
  useEffect(() => () => cleanupRef.current?.(), [])

  const onConnectorPointerDown = useCallback((e: PointerEvent<HTMLElement>, sourceKey: string) => {
    if (e.button > 0) return
    cleanupRef.current?.()
    e.preventDefault()
    e.stopPropagation()
    let current: LinkDrag | null = null

    const at = (clientX: number, clientY: number): LinkDrag | null => {
      const { getBody, rowKeys, rowHeight, stages, links } = optsRef.current
      const body = getBody()
      if (!body) return null
      const rect = body.getBoundingClientRect()
      const x = clientX - rect.left
      const y = clientY - rect.top
      const idx = Math.floor(y / rowHeight)
      const key = idx >= 0 && idx < rowKeys.length ? rowKeys[idx] : null
      const targetKey = key === sourceKey ? null : key
      const block = targetKey ? linkBlock(stages, links, sourceKey, targetKey) : null
      return { sourceKey, x, y, targetKey, block: block === "self" || block === "unknown" ? null : block }
    }
    const move = (ev: globalThis.PointerEvent) => {
      current = at(ev.clientX, ev.clientY)
      setDrag(current)
    }
    const finish = (commit: boolean) => {
      cleanupRef.current?.()
      setDrag(null)
      if (!commit || !current?.targetKey) return
      if (current.block) optsRef.current.onRejected(current.block)
      else optsRef.current.onLink({ from: sourceKey, to: current.targetKey })
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
    setDrag(current)
  }, [])

  return { drag, onConnectorPointerDown }
}

/** A bar being stretched: the stage and the duration shown while dragging. */
export interface ResizeState {
  key: string
  days: number
}

interface ResizeOptions {
  dayPx: number
  onCommit: (key: string, days: number) => void
}

/** Drag the right edge of a bar to change the stage's 目安期間 (whole days, 1–3650); Esc aborts. */
export function useDurationResize(options: ResizeOptions) {
  const [resize, setResize] = useState<ResizeState | null>(null)
  const optsRef = useRef(options)
  useEffect(() => {
    optsRef.current = options
  })
  const cleanupRef = useRef<(() => void) | null>(null)
  useEffect(() => () => cleanupRef.current?.(), [])

  const onResizePointerDown = useCallback((e: PointerEvent<HTMLElement>, key: string, startDays: number) => {
    if (e.button > 0) return
    cleanupRef.current?.()
    e.preventDefault()
    e.stopPropagation()
    const originX = e.clientX
    let days = startDays
    const clamp = (n: number) => Math.min(TEMPLATE_DURATION_MAX, Math.max(1, n))
    const move = (ev: globalThis.PointerEvent) => {
      days = clamp(startDays + Math.round((ev.clientX - originX) / optsRef.current.dayPx))
      setResize({ key, days })
    }
    const finish = (commit: boolean) => {
      cleanupRef.current?.()
      setResize(null)
      if (commit && days !== startDays) optsRef.current.onCommit(key, days)
    }
    const up = () => finish(true)
    const cancel = () => finish(false)
    const esc = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") finish(false)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", cancel)
    window.addEventListener("keydown", esc)
    cleanupRef.current = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", cancel)
      window.removeEventListener("keydown", esc)
      cleanupRef.current = null
    }
    setResize({ key, days })
  }, [])

  return { resize, onResizePointerDown }
}
