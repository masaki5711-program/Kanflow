"use client"

import { useToast, useConfirm } from "@/components/ui"
import { apiFetch, useVersionConflict, versionParam, withVersion } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { fillTemplate } from "@/lib/fill-template"
import { pickText } from "@/lib/translation/pick-text"
import { messageOf } from "../lib/errors"
import { sprintStartMessage, statusChangedTemplate } from "../lib/status-change"
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
  /** Unfinished PBIs (and their open tasks) of an earlier sprint to continue in this one. */
  carryOver?: { fromSprintId: string; pbItemIds: string[] }
}

type Deps = Pick<SprintsData, "sprints" | "refetchSprints" | "refetchReady" | "mutateSprints">

/** Sprint-level writes (create / status / delete / PBI membership). */
export function useSprintActions(projectId: string, { sprints, refetchSprints, refetchReady, mutateSprints }: Deps) {
  const { t, language } = useLanguage()
  const toast = useToast()
  const confirm = useConfirm()
  const onVersionConflict = useVersionConflict()
  const base = `/api/projects/${projectId}/sprints`
  const versionOf = (sprintId: string) => sprints.find((s) => s.id === sprintId)?.version

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
      toast.error(messageOf(err, t.error), { title: t.sprintCreateFailed })
      return false
    }
  }

  const displayName = (s: Sprint) => pickText(s.i18n, "sprintName", s.sprintName, language).text

  async function changeStatus(sprintId: string, status: string, retro: Partial<RetroFields> | null): Promise<boolean> {
    const sprint = sprints.find((s) => s.id === sprintId)
    try {
      await apiFetch(`${base}/${sprintId}`, { method: "PATCH", json: withVersion(buildStatusPatch(status, retro), versionOf(sprintId)) })
      // A3-10: every explicit status change confirms what happened.
      const template = sprint ? statusChangedTemplate(sprint.status, status, t) : null
      if (template && sprint) toast.success(fillTemplate(template, { name: displayName(sprint) }))
      refetchSprints()
      return true
    } catch (err) {
      if (onVersionConflict(err, () => refetchSprints())) return false
      toast.error(messageOf(err, t.error), { title: t.sprintStatusUpdateFailed })
      return false
    }
  }

  /** planning → active: confirm with the period / PBI / task / load summary first (the whole team is notified). */
  async function startSprint(sprint: Sprint): Promise<boolean> {
    const ok = await confirm({
      title: fillTemplate(t.sprintStartConfirmTitle, { name: displayName(sprint) }),
      message: sprintStartMessage(sprint, t, language),
      confirmLabel: t.sprintStartConfirmLabel,
      cancelLabel: t.cancel,
      variant: "info",
    })
    return ok ? changeStatus(sprint.id, "active", null) : false
  }

  async function deleteSprint(sprint: Sprint): Promise<void> {
    const ok = await confirm({
      message: t.sprintDeleteFullConfirm, confirmLabel: t.delete, cancelLabel: t.cancel, variant: "danger",
    })
    if (!ok) return
    const snapshot = sprints
    mutateSprints(sprints.filter((s) => s.id !== sprint.id))
    try {
      await apiFetch(`${base}/${sprint.id}${versionParam(sprint.version)}`, { method: "DELETE" })
      toast.success(t.sprintDeleted)
      refetchReady()
    } catch (err) {
      mutateSprints(snapshot)
      if (onVersionConflict(err, () => refetchSprints())) return
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

  return { createSprint, changeStatus, startSprint, deleteSprint, removePbi }
}
