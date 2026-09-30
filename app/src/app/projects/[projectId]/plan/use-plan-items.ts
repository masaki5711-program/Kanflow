"use client"

import { apiFetch, useApiQuery } from "@/hooks"
import { useToast } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { addDays, formatYmd, type PlanItem } from "./lib/plan-utils"

const NO_ITEMS: PlanItem[] = []

function siblingsOf(items: PlanItem[], item: PlanItem): PlanItem[] {
  return items.filter((i) => i.parentId === item.parentId).sort((a, b) => a.sortOrder - b.sortOrder)
}

/**
 * Master-plan items + mutations. Reads go through useApiQuery (abortable,
 * no stale overwrite); writes refetch afterwards so server-side aggregation
 * (parent progress) stays authoritative. Errors surface as toasts.
 */
export function usePlanItems(projectId: string) {
  const { t } = useLanguage()
  const toast = useToast()
  const base = `/api/projects/${projectId}/plan`
  const { data, isLoading, refetch, mutate } = useApiQuery<PlanItem[]>(base, { toastOnError: true })
  const items = data ?? NO_ITEMS

  function fail(err: unknown, title = t.errorUpdateFailed) {
    toast.error(err instanceof Error ? err.message : title, { title })
  }

  /**
   * PATCH an item. Inline edits (drag, keyboard nudge, indent/outdent) are
   * silent on success — the moved bar is the feedback; only explicit saves
   * (the edit dialog) pass `notifySuccess` to get a toast. Errors always toast.
   */
  async function patchItem(id: string, patch: Partial<PlanItem>, options?: { notifySuccess?: boolean }): Promise<boolean> {
    try {
      await apiFetch(`${base}/${id}`, { method: "PATCH", json: patch })
      if (options?.notifySuccess) toast.success(t.planSavedJustNow)
      return true
    } catch (err) {
      fail(err)
      return false
    } finally {
      // Refresh either way: applies aggregates on success, reverts optimistic edits on failure.
      refetch()
    }
  }

  async function createItem(initial?: Partial<PlanItem>): Promise<PlanItem | null> {
    const now = new Date()
    try {
      const created = await apiFetch<PlanItem>(base, {
        method: "POST",
        json: {
          name: initial?.name ?? t.planAddItem,
          plannedStart: initial?.plannedStart ?? formatYmd(now),
          plannedEnd: initial?.plannedEnd ?? formatYmd(addDays(now, 7)),
          parentId: initial?.parentId ?? null,
          isMilestone: initial?.isMilestone ?? false,
        },
      })
      refetch()
      return created
    } catch (err) {
      fail(err, t.errorCreationFailed)
      return null
    }
  }

  async function deleteItem(id: string): Promise<boolean> {
    try {
      await apiFetch(`${base}/${id}`, { method: "DELETE" })
      toast.success(t.planDeleted)
      refetch()
      return true
    } catch (err) {
      fail(err)
      return false
    }
  }

  /** Swap an item with its previous/next sibling (optimistic, rolled back on failure). */
  async function moveItem(id: string, direction: "up" | "down") {
    const me = items.find((i) => i.id === id)
    if (!me) return
    const siblings = siblingsOf(items, me)
    const idx = siblings.findIndex((s) => s.id === id)
    const other = siblings[direction === "up" ? idx - 1 : idx + 1]
    if (!other) return
    const previous = items
    mutate((list) =>
      list?.map((i) =>
        i.id === me.id ? { ...i, sortOrder: other.sortOrder } : i.id === other.id ? { ...i, sortOrder: me.sortOrder } : i,
      ),
    )
    try {
      await apiFetch(`${base}/reorder`, {
        method: "POST",
        json: {
          updates: [
            { id: me.id, parentId: me.parentId, sortOrder: other.sortOrder },
            { id: other.id, parentId: other.parentId, sortOrder: me.sortOrder },
          ],
        },
      })
    } catch (err) {
      mutate(previous)
      fail(err)
    }
  }

  /** Make the item a child of its previous sibling. */
  async function indentItem(id: string) {
    const me = items.find((i) => i.id === id)
    if (!me) return
    const siblings = siblingsOf(items, me)
    const idx = siblings.findIndex((s) => s.id === id)
    if (idx <= 0) return
    await patchItem(id, { parentId: siblings[idx - 1].id })
  }

  /** Move the item up one level (next to its parent). */
  async function outdentItem(id: string) {
    const me = items.find((i) => i.id === id)
    const parent = me?.parentId ? items.find((i) => i.id === me.parentId) : undefined
    if (!me || !parent) return
    await patchItem(id, { parentId: parent.parentId })
  }

  /** Local-only update used while dragging a bar (persisted on release). */
  function previewDates(id: string, plannedStart: string, plannedEnd: string) {
    mutate((list) => list?.map((i) => (i.id === id ? { ...i, plannedStart, plannedEnd } : i)))
  }

  return { items, isLoading, patchItem, createItem, deleteItem, moveItem, indentItem, outdentItem, previewDates }
}

export type PlanItemsApi = ReturnType<typeof usePlanItems>
