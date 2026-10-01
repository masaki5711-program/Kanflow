"use client"

import { useCallback, useState } from "react"
import { useRouter } from "next/navigation"
import { useConfirm, useToast } from "@/components/ui"
import { apiFetch, useApiMutation } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import type { Project } from "./types"

export type ProjectStatus = "active" | "archived"

interface StatusVars {
  id: string
  status: ProjectStatus
}

interface Options {
  /** Called after every successful status change (e.g. refetch the archived list if it is loaded). */
  onChanged?: () => void
}

/**
 * Archive / restore a project from the list through the regular
 * PATCH /api/projects/:id (same authz — "project.update" — and activity log
 * as the settings page). Optimistic: the card leaves its list at once and
 * comes back if the request fails. Archiving asks for confirmation and
 * offers "Undo" in the success toast.
 */
export function useProjectArchive({ onChanged }: Options = {}) {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const { t } = useLanguage()
  // Optimistic status per project id (undefined = server value).
  const [override, setOverride] = useState<Record<string, ProjectStatus | undefined>>({})

  /** Optimistic status; `listStatus` is the list the project came from (server truth until overridden). */
  const statusOf = useCallback((p: Project, listStatus: ProjectStatus): ProjectStatus => override[p.id] ?? listStatus, [override])

  /** Record a status the server already accepted (bulk archive / undo): the item moves list at once. */
  const markStatus = useCallback((id: string, status: ProjectStatus) => {
    setOverride((m) => ({ ...m, [id]: status }))
  }, [])

  const change = useApiMutation(
    ({ id, status }: StatusVars) => apiFetch(`/api/projects/${id}`, { method: "PATCH", json: { status } }),
    {
      onMutate: ({ id, status }) => {
        const prev = override[id]
        setOverride((m) => ({ ...m, [id]: status }))
        return prev
      },
      rollback: (prev, _err, { id }) => setOverride((m) => ({ ...m, [id]: prev })),
      onSuccess: () => {
        router.refresh()
        onChanged?.()
      },
    },
  )

  /** Resolves null on success, else the error (already rolled back). */
  async function setStatus(id: string, status: ProjectStatus): Promise<Error | null> {
    try {
      await change.mutateAsync({ id, status })
      return null
    } catch (e) {
      return e instanceof Error ? e : new Error(String(e))
    }
  }

  async function restore(project: Project): Promise<void> {
    const error = await setStatus(project.id, "active")
    if (error) toast.error(`${t.projectUnarchiveFailed}: ${error.message}`)
    else toast.success(t.projectUnarchived)
  }

  async function archive(project: Project): Promise<void> {
    const ok = await confirm({
      title: t.projectArchiveAction,
      message: t.projectArchiveConfirm.replaceAll("{name}", project.name),
      confirmLabel: t.projectArchiveAction,
      variant: "info",
    })
    if (!ok) return
    const error = await setStatus(project.id, "archived")
    if (error) {
      toast.error(`${t.projectArchiveFailed}: ${error.message}`)
      return
    }
    toast.success(t.projectArchived, {
      action: { label: t.projectArchiveUndo, onClick: () => void restore(project) },
    })
  }

  return { statusOf, markStatus, archive, restore, isPending: change.isPending }
}
