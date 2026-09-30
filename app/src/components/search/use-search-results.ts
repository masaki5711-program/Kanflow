"use client"

import { useEffect, useState } from "react"
import { apiFetch, isAbortError } from "@/hooks"
import type { SearchResultDto } from "@/services/search/search.types"

export const SEARCH_DEBOUNCE_MS = 200
export const SEARCH_MIN_CHARS = 2
export const SEARCH_PER_TYPE = 5

export type SearchStatus = "idle" | "short" | "loading" | "done" | "error"

export interface SearchState {
  status: SearchStatus
  /** Latest results; while a newer query loads, the previous ones stay visible. */
  result: SearchResultDto | null
}

interface Settled {
  query: string
  status: "done" | "error"
  result: SearchResultDto | null
}

export function normalizeSearchInput(raw: string): string {
  return raw.replace(/[\s　]+/g, " ").trim()
}

/**
 * Debounced (200 ms) global search. Every new query aborts the request of
 * the previous one, so a slow stale response can never overwrite newer
 * results. Below 2 characters nothing is requested.
 */
export function useSearchResults(input: string, { debounceMs = SEARCH_DEBOUNCE_MS, limit = SEARCH_PER_TYPE } = {}): SearchState {
  const query = normalizeSearchInput(input)
  const searchable = query.length >= SEARCH_MIN_CHARS
  const [settled, setSettled] = useState<Settled | null>(null)

  useEffect(() => {
    if (!searchable) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const url = `/api/search?q=${encodeURIComponent(query)}&limit=${limit}`
        const result = await apiFetch<SearchResultDto>(url, { signal: controller.signal })
        setSettled({ query, status: "done", result })
      } catch (err) {
        if (isAbortError(err) || controller.signal.aborted) return
        setSettled((prev) => ({ query, status: "error", result: prev?.result ?? null }))
      }
    }, debounceMs)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, searchable, limit, debounceMs])

  if (!searchable) return { status: query ? "short" : "idle", result: null }
  if (!settled || settled.query !== query) return { status: "loading", result: settled?.result ?? null }
  return { status: settled.status, result: settled.result }
}
