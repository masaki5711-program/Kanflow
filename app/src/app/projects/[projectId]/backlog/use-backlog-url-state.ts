"use client"

import { useCallback, useEffect, useMemo, useRef } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { filtersToParams, parseFilters, withPbiParam, type BacklogFilters } from "./url-state"

function href(pathname: string, params: URLSearchParams): string {
  const qs = params.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

export interface BacklogUrlState {
  filters: BacklogFilters
  /** Raw `?pbi=` value (id or displayId), or null. */
  pbiRef: string | null
  /** Replace filter values in the URL (no new history entry). */
  setFilters: (patch: Partial<BacklogFilters>) => void
  /** Open a PBI: a new history entry, so Back closes the modal. */
  openPbi: (ref: string) => void
  /** Close the PBI: steps back when we opened it, else removes the param in place. */
  closePbi: () => void
}

/**
 * Backlog view state kept in the URL. Updates go through the native History
 * API, which Next.js syncs with useSearchParams — no server round-trip per
 * keystroke, and the browser Back button works as expected.
 */
export function useBacklogUrlState(): BacklogUrlState {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const filters = useMemo(() => parseFilters(searchParams), [searchParams])
  const pbiRef = searchParams.get("pbi")
  // True while the open modal was opened by openPbi (its history entry is ours to pop).
  const pushedRef = useRef(false)

  useEffect(() => {
    if (!pbiRef) pushedRef.current = false
  }, [pbiRef])

  const current = useCallback(() => new URLSearchParams(window.location.search), [])

  const setFilters = useCallback(
    (patch: Partial<BacklogFilters>) => {
      window.history.replaceState(null, "", href(pathname, filtersToParams(current(), patch)))
    },
    [pathname, current],
  )

  const openPbi = useCallback(
    (ref: string) => {
      const next = withPbiParam(current(), ref)
      if (current().get("pbi")) {
        window.history.replaceState(null, "", href(pathname, next))
        return
      }
      pushedRef.current = true
      window.history.pushState(null, "", href(pathname, next))
    },
    [pathname, current],
  )

  const closePbi = useCallback(() => {
    if (!current().get("pbi")) return
    if (pushedRef.current) {
      pushedRef.current = false
      window.history.back()
      return
    }
    window.history.replaceState(null, "", href(pathname, withPbiParam(current(), null)))
  }, [pathname, current])

  return { filters, pbiRef, setFilters, openPbi, closePbi }
}
