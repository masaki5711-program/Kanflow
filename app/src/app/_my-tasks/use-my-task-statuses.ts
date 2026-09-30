"use client"

import { useCallback, useMemo, useState } from "react"
import { useToast } from "@/components/ui"
import { apiFetch, useVersionConflict, withVersion } from "@/hooks"
import { useLanguage } from "@/lib/language-context"

export interface StatusTask {
  id: string
  projectId: string
  sprintId: string
  status: string
  /** Optimistic-lock version the page loaded (undefined → unchecked write). */
  version?: number
}

interface LiveStatus {
  status: string
  version?: number
}

interface TaskRow {
  status: string
  version: number
}

export interface MyTaskStatusController<T extends StatusTask> {
  /** Tasks with the local (optimistic / confirmed) status applied, same order as the input. */
  tasks: T[]
  /** The live copy of one task (falls back to the given task). */
  live: (task: T) => T
  isPending: (taskId: string) => boolean
  changeStatus: (task: T, next: string) => Promise<void>
}

function without<V>(map: Readonly<Record<string, V>>, key: string): Record<string, V> {
  return Object.fromEntries(Object.entries(map).filter(([k]) => k !== key))
}

/**
 * Inline status changes of "my tasks" (home page): optimistic, PATCHing the
 * sprint task with its loaded version. A stale version (409) adopts the
 * server's row; any other failure reverts and toasts.
 */
export function useMyTaskStatuses<T extends StatusTask>(tasks: readonly T[]): MyTaskStatusController<T> {
  const { t } = useLanguage()
  const toast = useToast()
  const onVersionConflict = useVersionConflict()
  const [overrides, setOverrides] = useState<Record<string, LiveStatus>>({})
  const [pending, setPending] = useState<Record<string, true>>({})

  const live = useCallback((task: T): T => (overrides[task.id] ? { ...task, ...overrides[task.id] } : task), [overrides])
  const merged = useMemo(() => tasks.map(live), [tasks, live])

  const changeStatus = useCallback(
    async (task: T, next: string) => {
      const current = live(task)
      if (current.status === next) return
      const previous = overrides[task.id]
      const restore = () => setOverrides((m) => (previous ? { ...m, [task.id]: previous } : without(m, task.id)))
      setOverrides((m) => ({ ...m, [task.id]: { status: next, version: current.version } }))
      setPending((m) => ({ ...m, [task.id]: true }))
      try {
        const url = `/api/projects/${task.projectId}/sprints/${task.sprintId}/tasks/${task.id}`
        const saved = await apiFetch<Partial<TaskRow> | undefined>(url, { method: "PATCH", json: withVersion({ status: next }, current.version) })
        setOverrides((m) => ({ ...m, [task.id]: { status: saved?.status ?? next, version: saved?.version ?? current.version } }))
      } catch (err) {
        const handled = onVersionConflict<TaskRow>(err, (row) => {
          if (row) setOverrides((m) => ({ ...m, [task.id]: { status: row.status, version: row.version } }))
          else restore()
        })
        if (!handled) {
          restore()
          toast.error(err instanceof Error ? err.message : String(err), { title: t.topTaskStatusFailed })
        }
      } finally {
        setPending((m) => without(m, task.id))
      }
    },
    [live, overrides, onVersionConflict, toast, t.topTaskStatusFailed],
  )

  const isPending = useCallback((taskId: string) => !!pending[taskId], [pending])

  return { tasks: merged, live, isPending, changeStatus }
}
