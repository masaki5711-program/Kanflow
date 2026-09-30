"use client"

import { useToast, useConfirm } from "@/components/ui"
import { apiFetch, isApiError } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { messageOf } from "../lib/errors"
import { buildStatusPatch } from "../lib/task-payload"
import type { RetroFields, Sprint } from "../components/types"
import type { SprintsData } from "./use-sprints-data"

export interface CreateSprintInput {
  sprintName: string
  startDate: string
  endDate: string
  sprintGoal: string
  capacity: number
  selectedPbIds: string[]
}

type Deps = Pick<SprintsData, "sprints" | "refetchSprints" | "refetchReady" | "mutateSprints">

/** Sprint-level writes (create / status / delete / PBI membership). */
export function useSprintActions(projectId: string, { sprints, refetchSprints, refetchReady, mutateSprints }: Deps) {
  const { t } = useLanguage()
  const toast = useToast()
  const confirm = useConfirm()
  const base = `/api/projects/${projectId}/sprints`

  async function createSprint(input: CreateSprintInput): Promise<boolean> {
    try {
      await apiFetch(base, {
        method: "POST",
        json: { ...input, sprintGoal: input.sprintGoal || undefined },
      })
      toast.success(t.sprintCreated)
      refetchSprints()
      refetchReady()
      return true
    } catch (err) {
      if (isApiError(err) && err.status === 409) toast.error(t.sprintCreateBlocked)
      else toast.error(messageOf(err, t.error), { title: t.sprintCreateFailed })
      return false
    }
  }

  async function changeStatus(sprintId: string, status: string, retro: Partial<RetroFields> | null): Promise<boolean> {
    try {
      await apiFetch(`${base}/${sprintId}`, { method: "PATCH", json: buildStatusPatch(status, retro) })
      refetchSprints()
      return true
    } catch (err) {
      toast.error(messageOf(err, t.error), { title: t.sprintStatusUpdateFailed })
      return false
    }
  }

  async function deleteSprint(sprint: Sprint): Promise<void> {
    const ok = await confirm({
      message: t.sprintDeleteFullConfirm, confirmLabel: t.delete, cancelLabel: t.cancel, variant: "danger",
    })
    if (!ok) return
    const snapshot = sprints
    mutateSprints(sprints.filter((s) => s.id !== sprint.id))
    try {
      await apiFetch(`${base}/${sprint.id}`, { method: "DELETE" })
      toast.success(t.sprintDeleted)
      refetchReady()
    } catch (err) {
      mutateSprints(snapshot)
      toast.error(messageOf(err, t.error), { title: t.sprintDeleteFailed })
    }
  }

  async function removePbi(sprintId: string, pbItemId: string): Promise<void> {
    const ok = await confirm({
      message: t.sprintRemovePbiConfirm, confirmLabel: t.delete, cancelLabel: t.cancel, variant: "danger",
    })
    if (!ok) return
    try {
      await apiFetch(`${base}/${sprintId}/pbis`, { method: "DELETE", json: { pbItemId } })
      refetchSprints()
      refetchReady()
    } catch (err) {
      toast.error(messageOf(err, t.error), { title: t.sprintRemovePbiFailed })
    }
  }

  return { createSprint, changeStatus, deleteSprint, removePbi }
}
