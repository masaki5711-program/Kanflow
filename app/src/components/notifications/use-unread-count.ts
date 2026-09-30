"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export const UNREAD_POLL_MS = 60_000
export const UNREAD_COUNT_URL = "/api/notifications/unread-count"

export interface UnreadCount {
  count: number
  /** Re-fetch now (e.g. after opening the panel). */
  refresh: () => void
  /** Set locally after a mark-read (the next poll reconciles). */
  setCount: (next: number | ((prev: number) => number)) => void
}

function isVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState !== "hidden"
}

/**
 * Unread notification count for the header bell. Polls every 60 s but only
 * while the tab is visible; refreshes at once when the tab becomes visible
 * again or the window regains focus. Failures keep the last known count.
 */
export function useUnreadCount(enabled = true): UnreadCount {
  const [count, setCount] = useState(0)
  const controllerRef = useRef<AbortController | null>(null)

  const refresh = useCallback(() => {
    if (!enabled || !isVisible()) return
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    // Plain fetch, NOT apiFetch: background polling must not count as user
    // activity (apiFetch emits it), or the idle logout would never fire.
    fetch(UNREAD_COUNT_URL, { signal: controller.signal, headers: { Accept: "application/json" } })
      .then((res) => (res.ok ? (res.json() as Promise<{ unreadCount?: unknown }>) : null))
      .then((body) => {
        if (typeof body?.unreadCount === "number") setCount(body.unreadCount)
      })
      // Transient failure or aborted by a newer poll: keep the last known count; the next poll retries.
      .catch(() => undefined)
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    refresh()
    const timer = setInterval(refresh, UNREAD_POLL_MS)
    const onVisibility = () => {
      if (isVisible()) refresh()
    }
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("focus", refresh)
    return () => {
      clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("focus", refresh)
      controllerRef.current?.abort()
    }
  }, [enabled, refresh])

  return { count, refresh, setCount }
}
