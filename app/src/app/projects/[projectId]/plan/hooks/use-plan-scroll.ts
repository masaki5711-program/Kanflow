"use client"

import { useEffect, useRef, type RefObject } from "react"
import { useStableCallback } from "@/hooks/use-stable-callback"

/** Fraction of the visible timeline left of the focus point (today / a revealed bar). */
export const FOCUS_FRACTION = 1 / 3

/** scrollLeft that puts timeline x at 1/3 of the visible timeline (the grid column is sticky). */
export function scrollLeftFor(x: number, clientWidth: number, gridWidth: number): number {
  const visible = Math.max(0, clientWidth - gridWidth)
  return Math.max(0, Math.round(x - visible * FOCUS_FRACTION))
}

/** True when [x, x+width] is inside the visible part of the timeline. */
export function isSpanVisible(x: number, width: number, scrollLeft: number, clientWidth: number, gridWidth: number): boolean {
  const visible = Math.max(0, clientWidth - gridWidth)
  return x >= scrollLeft && x + Math.min(width, visible) <= scrollLeft + visible
}

export function scrollTimelineTo(container: HTMLElement | null, x: number, gridWidth: number): void {
  if (!container) return
  container.scrollLeft = scrollLeftFor(x, container.clientWidth, gridWidth)
}

/** Bring a bar (and its row) into view without moving when it already is visible. */
export function revealItem(container: HTMLElement | null, id: string, x: number, width: number, gridWidth: number): void {
  if (!container) return
  if (!isSpanVisible(x, width, container.scrollLeft, container.clientWidth, gridWidth)) scrollTimelineTo(container, x, gridWidth)
  const row = Array.from(container.querySelectorAll<HTMLElement>("[data-plan-row]")).find((r) => r.dataset.planRow === id)
  row?.scrollIntoView?.({ block: "nearest" })
}

/**
 * scrollLeft of the first view: `anchorDay` (see lib/viewport initialAnchorDay)
 * at the left edge of the timeline, or today at 1/3 when nothing is unfinished.
 */
export function initialScrollLeft(
  anchorDay: number | null,
  geometry: { startDay: number; dayWidth: number; todayX: number; clientWidth: number; gridWidth: number },
): number {
  if (anchorDay === null) return scrollLeftFor(geometry.todayX, geometry.clientWidth, geometry.gridWidth)
  return Math.max(0, Math.round((anchorDay - geometry.startDay) * geometry.dayWidth))
}

/** A zoom + scrollLeft the chart should show (see lib/fit-view). */
export interface ScrollTarget {
  zoom: string
  left: number
}

/**
 * On first load and on every zoom change, scroll to `target(clientWidth, isFirst)`
 * (computed from the latest geometry). A target with another zoom switches the
 * zoom first and scrolls once the chart re-rendered at it. Returns `apply`
 * (the "show everything" button uses it too).
 */
export function useInitialScroll(
  ref: RefObject<HTMLElement | null>,
  ready: boolean,
  target: (clientWidth: number, isFirst: boolean) => ScrollTarget,
  zoom: string,
  setZoom: (zoom: string) => void,
  skip: boolean,
): (next: ScrollTarget) => void {
  const pendingLeft = useRef<number | null>(null)
  const firstDone = useRef(false)
  const apply = useStableCallback((next: ScrollTarget) => {
    const el = ref.current
    if (!el) return
    if (next.zoom !== zoom) {
      pendingLeft.current = next.left
      setZoom(next.zoom)
      return
    }
    el.scrollLeft = next.left
  })
  useEffect(() => {
    const el = ref.current
    // A deep-linked item (?item=) owns the first view.
    if (ready && skip) firstDone.current = true
    if (!ready || skip || !el) return
    if (pendingLeft.current !== null) {
      el.scrollLeft = pendingLeft.current
      pendingLeft.current = null
      return
    }
    const isFirst = !firstDone.current
    firstDone.current = true
    apply(target(el.clientWidth, isFirst))
    // target reads the latest items / geometry; re-running on their own changes would fight the user's scrolling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, zoom, skip])
  return apply
}
