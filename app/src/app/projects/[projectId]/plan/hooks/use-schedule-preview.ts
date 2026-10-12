"use client"

import { useEffect, useState } from "react"
import { apiFetch } from "@/hooks"

type State<T> = { key: string; data: T | null }

const PREVIEW_DELAY_MS = 250

/**
 * POSTs `body` (a preview request: apply=false) to `url` whenever it changes,
 * debounced, and returns the latest answer. `data` is null while loading or
 * after a failure (`failed`), and for an answer to a request that is no longer
 * current (so a stale preview is never shown against new inputs).
 */
export function useSchedulePreview<T>(url: string, body: unknown, enabled = true): { data: T | null; failed: boolean; loading: boolean } {
  const key = enabled ? JSON.stringify([url, body]) : ""
  const [state, setState] = useState<State<T>>({ key: "", data: null })

  useEffect(() => {
    if (!enabled) return
    let live = true
    const timer = setTimeout(() => {
      apiFetch<T>(url, { method: "POST", json: body })
        .then((data) => live && setState({ key, data }))
        .catch(() => live && setState({ key, data: null }))
    }, PREVIEW_DELAY_MS)
    return () => {
      live = false
      clearTimeout(timer)
    }
    // `key` stands for url + body.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled])

  const answered = state.key === key
  return { data: answered ? state.data : null, failed: answered && state.data === null && key !== "", loading: enabled && !answered }
}
