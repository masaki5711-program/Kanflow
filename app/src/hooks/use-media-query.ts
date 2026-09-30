"use client"

import { useCallback, useSyncExternalStore } from "react"

/**
 * Subscribe to a CSS media query. Returns `serverValue` (default false)
 * during SSR / hydration, then the live match.
 *
 *   const isMobile = useMediaQuery("(max-width: 639px)")
 *   const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)")
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query)
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    [query],
  )
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query])
  return useSyncExternalStore(subscribe, getSnapshot, () => serverValue)
}

/** Tailwind `sm` breakpoint (640px) and below. */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 639px)")
}
