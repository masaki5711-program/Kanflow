"use client"

import { useEffect, type RefObject } from "react"

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

/** On first load and on every zoom change, scroll to `computeLeft(clientWidth)` (the latest geometry). */
export function useInitialScroll(ref: RefObject<HTMLElement | null>, ready: boolean, computeLeft: (clientWidth: number) => number, zoom: string, skip: boolean): void {
  useEffect(() => {
    const el = ref.current
    if (!ready || skip || !el) return
    el.scrollLeft = computeLeft(el.clientWidth)
    // computeLeft reads the latest items / geometry; re-running on their own changes would fight the user's scrolling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, zoom, skip])
}
