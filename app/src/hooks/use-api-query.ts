"use client"

import { useCallback, useEffect, useReducer, useRef } from "react"
import { useOptionalToast } from "@/components/ui/toast"
import { apiFetch, isAbortError, type ApiFetchInit } from "./api-client"
import {
  initialQueryState,
  queryReducer,
  requestKey,
  selectQueryView,
  type QueryAction,
  type QueryState,
} from "./api-query-state"

export interface UseApiQueryOptions<T> {
  /** Validate/narrow the JSON (e.g. `schema.parse`). Without it the body is cast to T. */
  parse?: (raw: unknown) => T
  /** Shown until the first response for the URL arrives (e.g. server-rendered data). */
  initialData?: T
  /** Set false to skip fetching (same as passing url = null). Default true. */
  enabled?: boolean
  /** Extra fetch options (headers, cache...). Read at request time; changes don't refetch. */
  init?: Omit<ApiFetchInit, "parse" | "signal">
  /** Show an error toast when the request fails. A function customises the message. */
  toastOnError?: boolean | ((error: Error) => string)
}

export interface UseApiQueryResult<T> {
  data: T | undefined
  error: Error | null
  /** In flight with nothing to show yet → render a skeleton. */
  isLoading: boolean
  /** In flight (including background refetches) → e.g. dim or show a small spinner. */
  isFetching: boolean
  /** Re-request the current URL. */
  refetch: () => void
  /** Locally replace/update the cached data (optimistic updates, post-mutation patching). */
  mutate: (updater: T | undefined | ((prev: T | undefined) => T | undefined)) => void
}

/**
 * GET JSON with cancellation: the in-flight request is aborted when the URL
 * changes or the component unmounts, and responses for a URL that is no
 * longer current are ignored, so stale data can never overwrite fresh data.
 *
 *   const { data, isLoading, error, refetch, mutate } =
 *     useApiQuery<Sprint[]>(projectId ? `/api/projects/${projectId}/sprints` : null)
 */
export function useApiQuery<T>(url: string | null, options: UseApiQueryOptions<T> = {}): UseApiQueryResult<T> {
  const { enabled = true, initialData } = options
  const effectiveUrl = enabled ? url : null
  const [state, dispatch] = useReducer(
    queryReducer as (s: QueryState<T>, a: QueryAction<T>) => QueryState<T>,
    undefined,
    () => initialQueryState<T>(),
  )
  const toast = useOptionalToast()

  const optionsRef = useRef(options)
  const toastRef = useRef(toast)
  useEffect(() => {
    optionsRef.current = options
    toastRef.current = toast
  })

  const key = requestKey(effectiveUrl, state.reloadToken)

  useEffect(() => {
    if (effectiveUrl === null || key === null) return
    const controller = new AbortController()
    const { parse, init, toastOnError } = optionsRef.current

    apiFetch<unknown>(effectiveUrl, { ...init, signal: controller.signal })
      .then((raw) => {
        if (controller.signal.aborted) return
        const data = parse ? parse(raw) : (raw as T)
        dispatch({ type: "success", key, url: effectiveUrl, data })
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || isAbortError(err)) return
        const error = err instanceof Error ? err : new Error(String(err))
        dispatch({ type: "error", key, url: effectiveUrl, error })
        if (toastOnError && toastRef.current) {
          toastRef.current.error(typeof toastOnError === "function" ? toastOnError(error) : error.message)
        }
      })

    return () => controller.abort()
  }, [effectiveUrl, key])

  const refetch = useCallback(() => dispatch({ type: "reload" }), [])

  const initialDataRef = useRef(initialData)
  useEffect(() => {
    initialDataRef.current = initialData
  })

  const mutate = useCallback(
    (updater: T | undefined | ((prev: T | undefined) => T | undefined)) => {
      if (effectiveUrl === null) return
      dispatch({ type: "mutate", url: effectiveUrl, fallback: initialDataRef.current, updater })
    },
    [effectiveUrl],
  )

  const view = selectQueryView(state, effectiveUrl, initialData)
  return { ...view, refetch, mutate }
}
