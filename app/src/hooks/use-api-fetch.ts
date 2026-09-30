"use client"

import { useCallback } from "react"
import { useOptionalToast } from "@/components/ui/toast"
import { apiFetch, isAbortError, type ApiFetchInit } from "./api-client"

export interface ApiFetchWithToastInit extends ApiFetchInit {
  /** Show an error toast (server message) before re-throwing. A function customises the text. */
  toastOnError?: boolean | ((error: Error) => string)
  /** Show a success toast with this text once the request succeeds. */
  toastOnSuccess?: string
}

export type BoundApiFetch = <T = unknown>(url: string, init?: ApiFetchWithToastInit) => Promise<T>

/**
 * `apiFetch` bound to the toast system — for event handlers that just need
 * "call the API, tell the user if it failed".
 *
 *   const api = useApiFetch()
 *   await api(`/api/projects/${id}/goals`, { method: "POST", json: form, toastOnError: true, toastOnSuccess: t.saved })
 */
export function useApiFetch(): BoundApiFetch {
  const toast = useOptionalToast()
  return useCallback(
    async <T,>(url: string, init: ApiFetchWithToastInit = {}): Promise<T> => {
      const { toastOnError, toastOnSuccess, ...rest } = init
      try {
        const result = await apiFetch<T>(url, rest)
        if (toastOnSuccess && toast) toast.success(toastOnSuccess)
        return result
      } catch (err: unknown) {
        if (toastOnError && toast && !isAbortError(err)) {
          const e = err instanceof Error ? err : new Error(String(err))
          toast.error(typeof toastOnError === "function" ? toastOnError(e) : e.message)
        }
        throw err
      }
    },
    [toast],
  )
}
