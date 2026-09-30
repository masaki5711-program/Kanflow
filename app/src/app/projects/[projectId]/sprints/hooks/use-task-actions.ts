"use client"

import { useToast, useConfirm } from "@/components/ui"
import { apiFetch } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { messageOf } from "../lib/errors"
import { patchTask, removeTask } from "../lib/sprint-metrics"
import { buildTaskCreate, buildTaskPatch } from "../lib/task-payload"
import type { TaskFormState } from "../components/types"
import type { SprintsData } from "./use-sprints-data"

type Deps = Pick<SprintsData, "sprints" | "refetchSprints" | "mutateSprints">

function isFinishedSprint(sprint: { status: string } | undefined): boolean {
  return sprint?.status === "done" || sprint?.status === "archived"
}

/** Task-level writes. Status toggles and deletes are optimistic with rollback. */
export function useTaskActions(projectId: string, { sprints, refetchSprints, mutateSprints }: Deps) {
  const { t } = useLanguage()
  const toast = useToast()
  const confirm = useConfirm()
  const tasksUrl = (sprintId: string) => `/api/projects/${projectId}/sprints/${sprintId}/tasks`

  async function saveTask(sprintId: string, taskId: string | null, form: TaskFormState): Promise<boolean> {
    try {
      if (taskId) {
        await apiFetch(`${tasksUrl(sprintId)}/${taskId}`, { method: "PATCH", json: buildTaskPatch(form) })
      } else {
        await apiFetch(tasksUrl(sprintId), { method: "POST", json: buildTaskCreate(form) })
      }
      refetchSprints()
      return true
    } catch (err) {
      toast.error(messageOf(err, t.error), { title: taskId ? t.sprintUpdateFailed : t.sprintAddFailed })
      return false
    }
  }

  async function bulkAddTasks(sprintId: string, pbItemId: string, assignee: string | null, taskNames: string[]): Promise<boolean> {
    if (!sprintId || !pbItemId || taskNames.length === 0) return false
    const results = await Promise.allSettled(
      taskNames.map((taskName) =>
        apiFetch(tasksUrl(sprintId), { method: "POST", json: { pbItemId, taskName, assignee, estimatedHours: null } }),
      ),
    )
    refetchSprints()
    const failed = results.filter((r) => r.status === "rejected").length
    if (failed > 0) {
      toast.error(`${t.sprintAddFailed}: ${failed}/${taskNames.length}`)
      return false
    }
    toast.success(t.sprintTaskBulkAdded.replace("{count}", String(taskNames.length)))
    return true
  }

  async function deleteTask(sprintId: string, taskId: string): Promise<void> {
    const ok = await confirm({
      message: t.sprintDeleteTaskConfirm, confirmLabel: t.delete, cancelLabel: t.cancel, variant: "danger",
    })
    if (!ok) return
    const snapshot = sprints
    mutateSprints(removeTask(sprints, sprintId, taskId))
    try {
      await apiFetch(`${tasksUrl(sprintId)}/${taskId}`, { method: "DELETE" })
      refetchSprints()
    } catch (err) {
      mutateSprints(snapshot)
      toast.error(messageOf(err, t.error), { title: t.sprintTaskDeleteFailed })
    }
  }

  async function quickUpdateTaskStatus(sprintId: string, taskId: string, status: string, completionComment?: string | null) {
    const body: Record<string, unknown> = { status }
    if (status === "done" && completionComment !== undefined) body.completionComment = completionComment
    const snapshot = sprints
    mutateSprints(patchTask(sprints, sprintId, taskId, body))
    try {
      await apiFetch(`${tasksUrl(sprintId)}/${taskId}`, { method: "PATCH", json: body })
      // The optimistic patch already shows the new status and every in-card
      // metric is derived client-side, so no full reload of all sprints.
      // Only a finished sprint's stored actualScore (average shown in the
      // header) needs the server's recalculation.
      if (isFinishedSprint(sprints.find((s) => s.id === sprintId))) refetchSprints()
    } catch (err) {
      mutateSprints(snapshot)
      toast.error(messageOf(err, t.error), { title: t.sprintTaskStatusFailed })
    }
  }

  async function editCompletionComment(sprintId: string, taskId: string, comment: string): Promise<boolean> {
    // Empty string collapses to null so the comment block disappears.
    const completionComment = comment.trim() ? comment : null
    try {
      await apiFetch(`${tasksUrl(sprintId)}/${taskId}`, { method: "PATCH", json: { completionComment } })
      refetchSprints()
      return true
    } catch (err) {
      toast.error(messageOf(err, t.error), { title: t.sprintTaskCommentSaveFailed })
      return false
    }
  }

  /** Follow-up Icebox item found while completing a task (author = current user, server side). */
  async function sendToIcebox(request: string, background?: string): Promise<boolean> {
    const json: Record<string, unknown> = { request }
    if (background) json.background = `(${t.sprintTaskCompletionComment}) ${background}`
    try {
      await apiFetch(`/api/projects/${projectId}/icebox`, { method: "POST", json })
      toast.success(t.completionToIceboxSent)
      return true
    } catch (err) {
      toast.error(messageOf(err, t.error), { title: t.sprintTaskIceboxFailed })
      return false
    }
  }

  return { saveTask, bulkAddTasks, deleteTask, quickUpdateTaskStatus, editCompletionComment, sendToIcebox }
}
