"use client"

import { useEffect } from "react"

let lockCount = 0
let saved: { overflow: string; paddingRight: string } | null = null

/** Reference-counted body scroll lock, safe for stacked dialogs. Returns an unlock fn. */
export function lockBodyScroll(): () => void {
  if (typeof document === "undefined") return () => {}
  if (lockCount === 0) {
    const body = document.body
    saved = { overflow: body.style.overflow, paddingRight: body.style.paddingRight }
    // Compensate for the disappearing scrollbar to avoid a layout jump.
    const scrollbar = window.innerWidth - document.documentElement.clientWidth
    body.style.overflow = "hidden"
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`
  }
  lockCount += 1
  let released = false
  return () => {
    if (released) return
    released = true
    lockCount -= 1
    if (lockCount === 0 && saved) {
      document.body.style.overflow = saved.overflow
      document.body.style.paddingRight = saved.paddingRight
      saved = null
    }
  }
}

/** Lock page scroll while `active`. */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return
    return lockBodyScroll()
  }, [active])
}
