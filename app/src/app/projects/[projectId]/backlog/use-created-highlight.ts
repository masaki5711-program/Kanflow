"use client"

import { useCallback, useEffect, useRef } from "react"
import { useDeepLinkHighlight, withoutParam } from "@/hooks/use-deep-link-highlight"
import type { BacklogItem } from "./types"
import { EMPTY_FILTERS, matchesFilters, type BacklogFilters } from "./url-state"

/** `?highlight=<pbiId>`: scroll to, focus and briefly highlight that card. */
export const HIGHLIGHT_PARAM = "highlight"

/** `id` of a backlog card's list item. */
export function backlogItemElementId(itemId: string): string {
  return `pbi-card-${itemId}`
}

interface Options {
  /** Every loaded PBI (view.all). */
  items: readonly BacklogItem[]
  loaded: boolean
  filters: BacklogFilters
  setFilters: (patch: Partial<BacklogFilters>) => void
}

/**
 * After a PBI is created (A3-11): once the refetched list contains it, the
 * card is scrolled into view and highlighted through the deep-link hook
 * (filters hiding it are cleared first). Returns `highlightWhenLoaded(id)`.
 */
export function useCreatedHighlight({ items, loaded, filters, setFilters }: Options): (itemId: string) => void {
  const pendingRef = useRef<string | null>(null)

  useEffect(() => {
    const id = pendingRef.current
    if (!id || !items.some((i) => i.id === id)) return
    pendingRef.current = null
    const params = new URLSearchParams(withoutParam(window.location.search, HIGHLIGHT_PARAM))
    params.set(HIGHLIGHT_PARAM, id)
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`)
  }, [items])

  useDeepLinkHighlight(HIGHLIGHT_PARAM, backlogItemElementId, {
    isReady: loaded,
    reveal: (id) => {
      const item = items.find((i) => i.id === id)
      if (!item) return false
      if (!matchesFilters(item, filters)) setFilters(EMPTY_FILTERS)
      return true
    },
  })

  return useCallback((itemId: string) => {
    pendingRef.current = itemId
  }, [])
}
