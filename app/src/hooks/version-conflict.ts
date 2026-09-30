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
import { useCallback, useState } from "react"
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

// === Edit forms: rebase on the server's version (stale-editor protection) ===

/** One field the user had changed that a conflict replaced with the server's value. */
export interface LostEdit<K extends string = string> {
  field: K
  /** What the user had typed (not saved). */
  mine: unknown
  /** The value now on the server. */
  theirs: unknown
}

/**
 * The user's edits (`mine` vs the `base` they started from) that differ from
 * the server's `latest` — i.e. what a conflict would silently drop. Fields the
 * other user changed to the same value are not "lost". Pure.
 */
export function lostEdits<F extends object>(base: F, mine: F, latest: F): LostEdit<Extract<keyof F, string>>[] {
  const keys = Object.keys(mine) as Extract<keyof F, string>[]
  return keys
    .filter((k) => !Object.is(mine[k], base[k]) && !Object.is(mine[k], latest[k]))
    .map((k) => ({ field: k, mine: mine[k], theirs: latest[k] }))
}

/** `latest` with the lost edits put back (the "restore my input" action). Pure, new object. */
export function reapplyEdits<F extends object>(latest: F, lost: readonly LostEdit<Extract<keyof F, string>>[]): F {
  return lost.reduce<F>((acc, e) => ({ ...acc, [e.field]: e.mine }), { ...latest })
}

export interface RebaseArgs<F, T> {
  /** The form as it was loaded (before the user's edits). */
  base: F
  /** The form as the user has it now. */
  mine: F
  /**
   * Load the server's row into the editor (replace the local copy with
   * `current`, or refetch when it is null) and return the new base form
   * (null when it is not known yet, e.g. refetching).
   */
  onConflict: (current: T | null) => F | null
}

/**
 * Editor side of a 409 VERSION_CONFLICT. The editor must not keep the stale
 * values (a second save would silently overwrite the other user), so
 * `rebase(err, { base, mine, onConflict })` hands `current` to the caller,
 * which loads it into the form; the user's overwritten values are kept in
 * `lost` for <VersionConflictNotice> until `dismiss()`.
 *
 *   const conflict = useConflictRebase<MyForm>()
 *   onError: (e) => { if (!conflict.rebase<MyRow>(e, { base, mine: form, onConflict: (cur) => { … return cur ? toForm(cur) : null } })) toast.error(…) }
 *   {conflict.lost && <VersionConflictNotice lost={conflict.lost} labels={…} onRestore={…} onDismiss={conflict.dismiss} />}
 *
 * Returns true when `err` was a version conflict (the caller skips its own error toast).
 */
export function useConflictRebase<F extends object>() {
  const [lost, setLost] = useState<readonly LostEdit<Extract<keyof F, string>>[] | null>(null)
  const rebase = useCallback(<T,>(err: unknown, args: RebaseArgs<F, T>): boolean => {
    const conflict = versionConflictOf<T>(err)
    if (!conflict) return false
    const latest = args.onConflict(conflict.current)
    // Unknown latest (refetching): keep every edit visible so nothing is lost.
    setLost(lostEdits(args.base, args.mine, latest ?? args.base))
    return true
  }, [])
  const dismiss = useCallback(() => setLost(null), [])
  return { rebase, lost, dismiss }
}
