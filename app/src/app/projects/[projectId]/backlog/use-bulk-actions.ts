"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useToast } from "@/components/ui"
import { apiFetch, useApiMutation } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { toggleSelection } from "./selection"
import type { BacklogStatus } from "./types"

export type BulkRequest =
  | { action: "status"; payload: { status: BacklogStatus } }
  | { action: "assignPo"; payload: { assignedPo: string | null } }
  | { action: "addToSprint"; payload: { sprintId: string } }
  | { action: "trash" }

interface BulkResponse {
  action: BulkRequest["action"]
  affectedIds: string[]
  skippedIds: string[]
}

/** Checkbox selection over the on-screen order (`orderedIds`); hidden items never count as selected. */
export function useBacklogSelection(orderedIds: readonly string[]) {
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
  const anchorRef = useRef<string | null>(null)

  const visibleSelected = useMemo(() => orderedIds.filter((id) => selected.has(id)), [orderedIds, selected])
  const selectedSet = useMemo(() => new Set(visibleSelected), [visibleSelected])

  const toggle = useCallback(
    (id: string, shift: boolean) => {
      setSelected((prev) => {
        const out = toggleSelection(prev, orderedIds, id, anchorRef.current, shift)
        anchorRef.current = out.anchor
        return out.selected
      })
    },
    [orderedIds],
  )
  const clear = useCallback(() => {
    anchorRef.current = null
    setSelected(new Set())
  }, [])
  const selectAll = useCallback(() => setSelected(new Set(orderedIds)), [orderedIds])
  const setMode = useCallback(
    (on: boolean) => {
      setSelectMode(on)
      if (!on) clear()
    },
    [clear],
  )

  return { selectMode, setMode, selectedIds: visibleSelected, selectedSet, toggle, clear, selectAll }
}

/**
 * "Moved to trash — Undo" toast. Undo restores every trashed PBI through the
 * trash API, then reloads the backlog.
 */
export function useTrashUndo(projectId: string, refetch: () => void) {
  const { t } = useLanguage()
  const toast = useToast()

  const restore = useCallback(
    async (ids: readonly string[]) => {
      const results = await Promise.allSettled(
        ids.map((id) => apiFetch(`/api/projects/${projectId}/trash/backlog_item/${id}/restore`, { method: "POST" })),
      )
      refetch()
      const restored = results.filter((r) => r.status === "fulfilled").length
      if (restored === ids.length) toast.success(t.backlogRestored.replace("{count}", String(restored)))
      else toast.error(t.backlogRestoreFailed)
    },
    [projectId, refetch, t, toast],
  )

  return useCallback(
    (ids: readonly string[]) => {
      if (ids.length === 0) return
      toast.success(t.backlogTrashedToast.replace("{count}", String(ids.length)), {
        action: { label: t.backlogUndo, onClick: () => void restore(ids) },
      })
    },
    [restore, t, toast],
  )
}

/** POST /backlog/bulk for the selected ids; reloads the list and reports the outcome. */
export function useBulkActions(projectId: string, opts: { refetch: () => void; onTrashed: (ids: readonly string[]) => void; onDone: () => void }) {
  const { t } = useLanguage()
  const toast = useToast()
  const optsRef = useRef(opts)
  useEffect(() => {
    optsRef.current = opts
  })

  return useApiMutation(
    ({ ids, request }: { ids: readonly string[]; request: BulkRequest }) =>
      apiFetch<BulkResponse>(`/api/projects/${projectId}/backlog/bulk`, { method: "POST", json: { ids, ...request } }),
    {
      onSuccess: (res) => {
        const { refetch, onTrashed, onDone } = optsRef.current
        refetch()
        onDone()
        if (res.action === "trash") onTrashed(res.affectedIds)
        else toast.success(t.backlogBulkDone.replace("{count}", String(res.affectedIds.length)))
        if (res.skippedIds.length > 0) toast.info(t.backlogBulkSkipped.replace("{count}", String(res.skippedIds.length)))
      },
      toastOnError: (e) => `${t.backlogBulkFailed}: ${e.message}`,
    },
  )
}
