"use client"

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react"

const GAP = 4
const EDGE = 8
const MIN_HEIGHT = 96

/**
 * Places a dropdown list next to its trigger with `position: fixed`, so it is
 * neither clipped by an `overflow-hidden` ancestor nor pushed off the bottom
 * of the screen: it opens upwards when there is more room above, shrinks (and
 * scrolls) to the room that is left, and stays inside the viewport sideways.
 * Positioned on the DOM node directly: no extra render, no flash. A scroll or
 * resize closes it (`onDismiss`) instead of leaving it adrift.
 */
export function useAnchoredPosition(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  listRef: RefObject<HTMLElement | null>,
  align: "left" | "right",
  onDismiss: () => void,
) {
  const dismissRef = useRef(onDismiss)
  useEffect(() => {
    dismissRef.current = onDismiss
  })

  useLayoutEffect(() => {
    if (!open) return
    const anchor = anchorRef.current
    const list = listRef.current
    if (!anchor || !list) return
    const rect = anchor.getBoundingClientRect()
    const below = window.innerHeight - rect.bottom - EDGE - GAP
    const above = rect.top - EDGE - GAP
    const up = list.scrollHeight > below && above > below
    const room = Math.max(MIN_HEIGHT, up ? above : below)
    const height = Math.min(list.scrollHeight, room)
    const width = list.offsetWidth
    const left = align === "right" ? rect.right - width : rect.left
    list.style.position = "fixed"
    list.style.maxHeight = `${room}px`
    list.style.top = `${up ? Math.max(EDGE, rect.top - GAP - height) : rect.bottom + GAP}px`
    list.style.left = `${Math.min(Math.max(EDGE, left), Math.max(EDGE, window.innerWidth - width - EDGE))}px`
    list.style.right = "auto"
    list.style.bottom = "auto"
    list.style.margin = "0"
  }, [open, anchorRef, listRef, align])

  useEffect(() => {
    if (!open) return
    const dismiss = () => dismissRef.current()
    // Scrolling the list itself must not close it.
    const onScroll = (e: Event) => {
      if (e.target instanceof Node && listRef.current?.contains(e.target)) return
      dismiss()
    }
    window.addEventListener("scroll", onScroll, true)
    window.addEventListener("resize", dismiss)
    return () => {
      window.removeEventListener("scroll", onScroll, true)
      window.removeEventListener("resize", dismiss)
    }
  }, [open, listRef])
}
