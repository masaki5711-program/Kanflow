"use client"

import { useEffect, useState, type RefObject } from "react"

export interface TimelineViewport {
  scrollLeft: number
  /** clientWidth of the chart scroll box (0 until measured). */
  clientWidth: number
}

const INITIAL: TimelineViewport = { scrollLeft: 0, clientWidth: 0 }

/**
 * Horizontal scroll position and width of the chart scroll box, updated at
 * most once per frame on scroll / resize (edge indicators, splitter bounds,
 * print "visible period"). `attached` = the box is rendered (re-attaches when it remounts).
 */
export function useTimelineViewport(ref: RefObject<HTMLElement | null>, attached: boolean): TimelineViewport {
  const [vp, setVp] = useState<TimelineViewport>(INITIAL)
  useEffect(() => {
    const el = ref.current
    if (!attached || !el) return
    let frame = 0
    const measure = () => {
      frame = 0
      setVp((prev) => (prev.scrollLeft === el.scrollLeft && prev.clientWidth === el.clientWidth ? prev : { scrollLeft: el.scrollLeft, clientWidth: el.clientWidth }))
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    measure()
    el.addEventListener("scroll", schedule, { passive: true })
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule)
    observer?.observe(el)
    window.addEventListener("resize", schedule)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      el.removeEventListener("scroll", schedule)
      observer?.disconnect()
      window.removeEventListener("resize", schedule)
    }
  }, [ref, attached])
  return vp
}
