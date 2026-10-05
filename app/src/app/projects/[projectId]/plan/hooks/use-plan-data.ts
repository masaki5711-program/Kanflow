"use client"

import { useCallback, useMemo } from "react"
import { useToast } from "@/components/ui"
import { apiFetch, useApiQuery, useVersionConflict, versionConflictOf, versionParam, withVersion } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { normalizeItem, normalizePlanData } from "../lib/normalize"
import type { PlanData, PlanItem, PlanItemInput, PlanItemPatch, ReorderUpdate } from "../lib/plan-types"
import { applyUpdates } from "../lib/tree"

const EMPTY: PlanData = { items: [], dependencies: [], today: "" }

export interface PatchOptions {
  notify?: boolean
  /** 409 VERSION_CONFLICT: the item as it is on the server now (null when the body had none). */
  onConflict?: (current: PlanItem | null) => void
}

const errMessage = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback)

/**
 * Master-plan data + writes. Reads go through useApiQuery; every write
 * refetches afterwards because the server derives parent dates/progress,
 * schedule states and baselines. Edits send the loaded `version`; a 409
 * hands the server's copy to `onConflict` (the editor reloads its form).
 * Errors surface as toasts.
 */
export function usePlanData(projectId: string) {
  const { t } = useLanguage()
  const toast = useToast()
  const onVersionConflict = useVersionConflict()
  const base = `/api/projects/${projectId}/plan`
  const query = useApiQuery<PlanData>(base, { parse: (raw) => normalizePlanData(raw), toastOnError: true })
  const { refetch, mutate } = query
  const data = query.data ?? EMPTY

  const setItems = useCallback(
    (fn: (items: PlanItem[]) => PlanItem[]) => mutate((d) => (d ? { ...d, items: fn(d.items) } : d)),
    [mutate],
  )

  const fail = useCallback(
    (err: unknown, title = t.errorUpdateFailed) => toast.error(errMessage(err, title), { title }),
    [t, toast],
  )

  const createItem = useCallback(
    async (input: PlanItemInput): Promise<PlanItem | null> => {
      try {
        const raw = await apiFetch<unknown>(base, { method: "POST", json: input })
        toast.success(t.planCreated)
        refetch()
        return raw && typeof raw === "object" ? normalizeItem(raw as Record<string, unknown>) : null
      } catch (err) {
        fail(err, t.errorCreationFailed)
        return null
      }
    },
    [base, fail, refetch, t, toast],
  )

  /**
   * PATCH with optimistic locking. Inline edits are silent; the editor passes
   * `notify` and `onConflict` (receives the server's current item, or null).
   */
  const patchItem = useCallback(
    async (item: PlanItem, patch: PlanItemPatch, options?: PatchOptions): Promise<boolean> => {
      try {
        await apiFetch(`${base}/${item.id}`, { method: "PATCH", json: withVersion(patch, item.version) })
        if (options?.notify) toast.success(t.planSavedJustNow)
        return true
      } catch (err) {
        const toItem = (current: Record<string, unknown> | null) =>
          current && typeof current === "object" ? normalizeItem(current) : null
        const conflict = options?.onConflict ? versionConflictOf<Record<string, unknown>>(err) : null
        if (conflict && options?.onConflict) {
          // The editor explains the conflict in place (with "restore my input"): no duplicate toast (N-05).
          options.onConflict(toItem(conflict.current))
          return false
        }
        const handled = onVersionConflict<Record<string, unknown>>(err, (current) => options?.onConflict?.(toItem(current)))
        if (!handled) fail(err)
        return false
      } finally {
        refetch()
      }
    },
    [base, fail, onVersionConflict, refetch, t, toast],
  )

  /** Local-only date change while dragging / nudging (persisted by patchItem). */
  const previewDates = useCallback(
    (id: string, plannedStart: string, plannedEnd: string) =>
      setItems((items) => items.map((i) => (i.id === id ? { ...i, plannedStart, plannedEnd } : i))),
    [setItems],
  )

  const restore = useCallback(
    async (id: string) => {
      try {
        await apiFetch(`/api/projects/${projectId}/trash/plan_item/${id}/restore`, { method: "POST" })
        toast.success(t.planRestored)
      } catch (err) {
        fail(err, t.planRestoreFailed)
      } finally {
        refetch()
      }
    },
    [fail, projectId, refetch, t, toast],
  )

  /** Move the subtree to the trash; the toast offers Undo. */
  const deleteItem = useCallback(
    async (item: PlanItem, displayName: string): Promise<boolean> => {
      try {
        const res = await apiFetch<{ deletedCount?: number }>(`${base}/${item.id}${versionParam(item.version)}`, { method: "DELETE" })
        const count = typeof res?.deletedCount === "number" ? res.deletedCount : 1
        toast.success(t.planDeleted.replace("{name}", displayName).replace("{count}", String(count)), {
          action: { label: t.planUndo, onClick: () => void restore(item.id) },
        })
        return true
      } catch (err) {
        if (!onVersionConflict(err, () => undefined)) fail(err)
        return false
      } finally {
        refetch()
      }
    },
    [base, fail, onVersionConflict, refetch, restore, t, toast],
  )

  /** Structural move (optimistic, rolled back on failure). */
  const reorder = useCallback(
    async (updates: ReorderUpdate[] | null): Promise<boolean> => {
      if (!updates || updates.length === 0) return false
      const previous = query.data
      setItems((items) => applyUpdates(items, updates))
      try {
        await apiFetch(`${base}/reorder`, { method: "POST", json: { updates } })
        refetch()
        return true
      } catch (err) {
        mutate(previous)
        fail(err)
        return false
      }
    },
    [base, fail, mutate, query.data, refetch, setItems],
  )

  /** Fire-and-refetch write with a success toast (baseline, dependencies). */
  const simpleWrite = useCallback(
    async (url: string, method: "POST" | "DELETE", success: string, json?: unknown, failTitle?: string): Promise<boolean> => {
      try {
        await apiFetch(url, { method, json })
        toast.success(success)
        return true
      } catch (err) {
        fail(err, failTitle)
        return false
      } finally {
        refetch()
      }
    },
    [fail, refetch, toast],
  )

  const actions = useMemo(
    () => ({
      saveBaseline: () => simpleWrite(`${base}/baseline`, "POST", t.planBaselineSaved, {}),
      clearBaseline: () => simpleWrite(`${base}/baseline`, "DELETE", t.planBaselineCleared),
      addDependency: (predecessorId: string, successorId: string) =>
        simpleWrite(`${base}/dependencies`, "POST", t.planDependencyAdded, { predecessorId, successorId }, t.planDependencyAddFailed),
      removeDependency: (id: string) => simpleWrite(`${base}/dependencies/${id}`, "DELETE", t.planDependencyRemoved),
    }),
    [base, simpleWrite, t],
  )

  return {
    base,
    data,
    isLoading: query.isLoading,
    refetch,
    createItem,
    patchItem,
    previewDates,
    deleteItem,
    reorder,
    ...actions,
  }
}

export type PlanDataApi = ReturnType<typeof usePlanData>
