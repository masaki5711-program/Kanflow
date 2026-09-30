"use client"

/**
 * Client side of optimistic locking (P2). PBIs, sprint tasks, sprints and
 * Icebox items carry `version`; writes send the version the UI loaded and a
 * stale one is answered with 409 `{ error, code: "VERSION_CONFLICT", current }`.
 *
 *   await apiFetch(url, { method: "PATCH", json: withVersion(patch, item.version) })
 *   await apiFetch(`${url}${versionParam(item.version)}`, { method: "DELETE" })
 *
 *   const onVersionConflict = useVersionConflict()
 *   catch (err) { if (onVersionConflict(err, (current) => current ? replace(current) : refetch())) return }
 */
import { useCallback } from "react"
import { useToast, type ToastApi } from "@/components/ui/toast"
import { useLanguage } from "@/lib/language-context"
import { isApiError } from "./api-client"

export interface VersionConflict<T> {
  /** The row as it is on the server now (null when the body had none — refetch instead). */
  current: T | null
}

/** The conflict of a failed write, or null when `err` is not a 409 VERSION_CONFLICT. */
export function versionConflictOf<T = unknown>(err: unknown): VersionConflict<T> | null {
  if (!isApiError(err) || err.status !== 409 || err.code !== "VERSION_CONFLICT") return null
  const body = err.body
  const current = typeof body === "object" && body !== null && "current" in body ? (body as { current: unknown }).current : null
  return { current: (current ?? null) as T | null }
}

/** Request body plus the loaded version (omitted when unknown → the server does an unchecked write). */
export function withVersion<T extends object>(body: T, version: number | undefined): T & { version?: number } {
  return version === undefined ? { ...body } : { ...body, version }
}

/** `?version=N` for a DELETE URL ("" when unknown). */
export function versionParam(version: number | undefined): string {
  return version === undefined ? "" : `?version=${version}`
}

export interface VersionConflictHandling<T> {
  toast: Pick<ToastApi, "error">
  /** Localized "someone else updated first; the latest was loaded" text. */
  message: string
  /** Replace the local copy with `current`, or refetch when it is null. */
  onConflict: (current: T | null) => void
}

/** Toast + hand over `current`. True when `err` was a version conflict (the caller then skips its own error toast). */
export function handleVersionConflict<T>(err: unknown, handling: VersionConflictHandling<T>): boolean {
  const conflict = versionConflictOf<T>(err)
  if (!conflict) return false
  handling.toast.error(handling.message)
  handling.onConflict(conflict.current)
  return true
}

/**
 * `toastOnError` for `useApiMutation`: a version conflict shows its own
 * (already localized) message alone; anything else goes through `format`.
 * Pair with an `onError` that refetches on `versionConflictOf(err)`.
 */
export function conflictAwareToast(format: (e: Error) => string): (e: Error) => string {
  return (e) => (versionConflictOf(e) ? e.message : format(e))
}

/** `handleVersionConflict` bound to the kit toast and the UI language. */
export function useVersionConflict() {
  const toast = useToast()
  const { t } = useLanguage()
  return useCallback(
    <T,>(err: unknown, onConflict: (current: T | null) => void): boolean =>
      handleVersionConflict<T>(err, { toast, message: t.apiErrVersionConflict, onConflict }),
    [toast, t],
  )
}
