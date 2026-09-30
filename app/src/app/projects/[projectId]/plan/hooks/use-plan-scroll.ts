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

/** On first load and on every zoom change, scroll so today sits ~1/3 from the left. */
export function useScrollToToday(ref: RefObject<HTMLElement | null>, ready: boolean, todayX: number, gridWidth: number, zoom: string, skip: boolean): void {
  useEffect(() => {
    if (!ready || skip) return
    scrollTimelineTo(ref.current, todayX, gridWidth)
    // gridWidth / todayX follow zoom; re-running on their own changes would fight the user's scrolling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, zoom, skip])
}
