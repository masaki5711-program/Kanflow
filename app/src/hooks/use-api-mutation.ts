"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useOptionalToast } from "@/components/ui/toast"

export interface UseApiMutationOptions<TVars, TResult, TSnapshot> {
  /**
   * Apply the optimistic change before the request; return a snapshot that
   * `rollback` receives if the request fails.
   */
  onMutate?: (vars: TVars) => TSnapshot
  /** Undo the optimistic change (called with the snapshot from onMutate). */
  rollback?: (snapshot: TSnapshot, error: Error, vars: TVars) => void
  onSuccess?: (result: TResult, vars: TVars) => void
  onError?: (error: Error, vars: TVars) => void
  /** Show an error toast on failure. A function customises the message. */
  toastOnError?: boolean | ((error: Error) => string)
  /** Show a success toast. A function receives the result. */
  toastOnSuccess?: string | ((result: TResult) => string)
}

export interface UseApiMutationResult<TVars, TResult> {
  /** Run the mutation. Resolves with the result, or undefined when it failed (errors are captured in `error`). */
  mutate: (vars: TVars) => Promise<TResult | undefined>
  /** Same as mutate but re-throws on failure. */
  mutateAsync: (vars: TVars) => Promise<TResult>
  isPending: boolean
  error: Error | null
  reset: () => void
}

/**
 * Wrap a write request with pending/error state and optional optimistic
 * update + rollback.
 *
 *   const { data, mutate: setItems } = useApiQuery<Item[]>(url)
 *   const del = useApiMutation(
 *     (id: string) => apiFetch(`${url}/${id}`, { method: "DELETE" }),
 *     {
 *       onMutate: (id) => { const prev = data; setItems((l) => l?.filter((i) => i.id !== id)); return prev },
 *       rollback: (prev) => setItems(prev),
 *       toastOnError: true,
 *     },
 *   )
 *   <Button loading={del.isPending} onClick={() => del.mutate(item.id)}>…</Button>
 */
export function useApiMutation<TVars, TResult = unknown, TSnapshot = unknown>(
  fn: (vars: TVars) => Promise<TResult>,
  options: UseApiMutationOptions<TVars, TResult, TSnapshot> = {},
): UseApiMutationResult<TVars, TResult> {
  const [pendingCount, setPendingCount] = useState(0)
  const [error, setError] = useState<Error | null>(null)
  const toast = useOptionalToast()
  const latest = useRef({ fn, options, toast })
  const mountedRef = useRef(true)

  useEffect(() => {
    latest.current = { fn, options, toast }
  })
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const mutateAsync = useCallback(async (vars: TVars): Promise<TResult> => {
    const { fn: run, options: opts, toast: t } = latest.current
    setError(null)
    setPendingCount((c) => c + 1)
    const snapshot = opts.onMutate ? opts.onMutate(vars) : undefined
    try {
      const result = await run(vars)
      opts.onSuccess?.(result, vars)
      if (opts.toastOnSuccess && t) {
        t.success(typeof opts.toastOnSuccess === "function" ? opts.toastOnSuccess(result) : opts.toastOnSuccess)
      }
      return result
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err))
      if (opts.onMutate && opts.rollback) opts.rollback(snapshot as TSnapshot, e, vars)
      opts.onError?.(e, vars)
      if (opts.toastOnError && t) {
        t.error(typeof opts.toastOnError === "function" ? opts.toastOnError(e) : e.message)
      }
      if (mountedRef.current) setError(e)
      throw e
    } finally {
      if (mountedRef.current) setPendingCount((c) => Math.max(0, c - 1))
    }
  }, [])

  const mutate = useCallback(
    (vars: TVars) => mutateAsync(vars).catch(() => undefined),
    [mutateAsync],
  )

  const reset = useCallback(() => setError(null), [])

  return { mutate, mutateAsync, isPending: pendingCount > 0, error, reset }
}
