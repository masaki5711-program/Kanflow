"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { useToast } from "@/components/ui"
import { apiFetch } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { diffDays } from "../lib/date"
import type { PlanDependency, PlanItem, Ymd } from "../lib/plan-types"
import { fillTemplate } from "../lib/template"
import { descendantIds } from "../lib/tree"
import type { BulkMode } from "../components/plan-bulk-dialog"
import type { PlanDataApi } from "./use-plan-data"

export interface CascadeTarget {
  id: string
  name: string
  /** Days the item's planned end moved (+ = later). */
  delta: number
}

interface Options {
  api: PlanDataApi
  items: readonly PlanItem[]
  dependencies: readonly PlanDependency[]
  /** Ids of the visible rows in display order (range selection). */
  rowIds: readonly string[]
  nameOf: (item: PlanItem) => string
  /** Called with the id of a freshly duplicated item (select / reveal it). */
  onDuplicated: (id: string) => void
}

/**
 * The scheduling assists around the plan chart: multi-select, the "move the
 * followers too?" question after a date change, duplicate, and which assist
 * dialog is open. State only — the dialogs are rendered by PlanAssistDialogs.
 */
export function usePlanAssist({ api, items, dependencies, rowIds, nameOf, onDuplicated }: Options) {
  const { t } = useLanguage()
  const toast = useToast()
  const [selecting, setSelectingState] = useState(false)
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set())
  const [cascade, setCascade] = useState<CascadeTarget | null>(null)
  const [bulk, setBulk] = useState<BulkMode | null>(null)
  const [reflowOpen, setReflowOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const lastCheckedRef = useRef<string | null>(null)

  const setSelecting = useCallback((on: boolean) => {
    setSelectingState(on)
    if (!on) {
      setChecked(new Set())
      lastCheckedRef.current = null
    }
  }, [])

  /** Toggle one row; `range` checks everything between the last toggled row and this one. */
  const check = useCallback(
    (id: string, range = false) => {
      setSelectingState(true)
      // Read before queueing: the updater below runs later, after the ref has moved on.
      const last = lastCheckedRef.current
      setChecked((prev) => {
        const next = new Set(prev)
        const from = range && last ? rowIds.indexOf(last) : -1
        const to = rowIds.indexOf(id)
        if (from >= 0 && to >= 0) {
          for (const rid of rowIds.slice(Math.min(from, to), Math.max(from, to) + 1)) next.add(rid)
        } else if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
      lastCheckedRef.current = id
    },
    [rowIds],
  )

  const selectVisible = useCallback(() => setChecked(new Set(rowIds)), [rowIds])
  const clearChecked = useCallback(() => {
    setChecked(new Set())
    lastCheckedRef.current = null
  }, [])

  /** Persist both planned dates; when the end moved and followers exist, ask whether they move too. */
  const commitDates = useCallback(
    async (item: PlanItem, start: Ymd, end: Ymd): Promise<void> => {
      if (!(await api.patchItem(item, { plannedStart: start, plannedEnd: end }))) return
      if (!item.plannedEnd) return
      const delta = diffDays(item.plannedEnd, end)
      if (delta !== 0 && dependencies.some((d) => d.predecessorId === item.id)) setCascade({ id: item.id, name: nameOf(item), delta })
    },
    [api, dependencies, nameOf],
  )

  const duplicateOne = useCallback(
    async (item: PlanItem): Promise<string | null> => {
      try {
        const res = await apiFetch<{ rootId: string }>(`${api.base}/${item.id}/duplicate`, { method: "POST", json: { suffix: t.pscCopySuffix } })
        return res.rootId
      } catch (err) {
        toast.error(err instanceof Error && err.message ? err.message : t.pscDuplicateFailed, { title: t.pscDuplicateFailed })
        return null
      }
    },
    [api.base, t, toast],
  )

  const duplicate = useCallback(
    async (item: PlanItem) => {
      const rootId = await duplicateOne(item)
      api.refetch()
      if (!rootId) return
      toast.success(fillTemplate(t.pscDuplicated, { name: nameOf(item) }))
      onDuplicated(rootId)
    },
    [api, duplicateOne, nameOf, onDuplicated, t, toast],
  )

  /** Duplicate every checked row; a checked row inside a checked branch is copied with its parent only. */
  const duplicateChecked = useCallback(async () => {
    const covered = new Set<string>()
    for (const id of checked) for (const d of descendantIds(items, id)) covered.add(d)
    const tops = items.filter((i) => checked.has(i.id) && !covered.has(i.id))
    let last: string | null = null
    let done = 0
    for (const item of tops) {
      const rootId = await duplicateOne(item)
      if (!rootId) break
      last = rootId
      done += 1
    }
    api.refetch()
    if (done > 0) toast.success(fillTemplate(t.pscBulkDone, { n: done }))
    if (last) onDuplicated(last)
  }, [api, checked, duplicateOne, items, onDuplicated, t, toast])

  return useMemo(
    () => ({
      selecting,
      setSelecting,
      checked,
      check,
      selectVisible,
      clearChecked,
      commitDates,
      invalidDates: () => toast.error(t.planDateOrderError),
      duplicate,
      duplicateChecked,
      cascade,
      setCascade,
      bulk,
      setBulk,
      reflowOpen,
      setReflowOpen,
      importOpen,
      setImportOpen,
    }),
    [selecting, setSelecting, checked, check, selectVisible, clearChecked, commitDates, toast, t, duplicate, duplicateChecked, cascade, bulk, reflowOpen, importOpen],
  )
}

export type PlanAssist = ReturnType<typeof usePlanAssist>
