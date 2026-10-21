"use client"

import { useToast, useConfirm } from "@/components/ui"
import { apiFetch, useVersionConflict, versionParam, withVersion } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { messageOf } from "../lib/errors"
import { patchTask, removeTask } from "../lib/sprint-metrics"
import { buildTaskCreate, buildTaskPatch } from "../lib/task-payload"
import type { Sprint, SprintItem, TaskFieldPatch, TaskFormState } from "../components/types"
import type { SprintsData } from "./use-sprints-data"

type Deps = Pick<SprintsData, "sprints" | "refetchSprints" | "mutateSprints">

function isFinishedSprint(sprint: { status: string } | undefined): boolean {
  return sprint?.status === "done" || sprint?.status === "archived"
}

/** Optimistic-lock version of a loaded task (undefined = unknown → unchecked write). */
export function taskVersion(sprints: readonly Sprint[], sprintId: string, taskId: string): number | undefined {
  return sprints.find((s) => s.id === sprintId)?.items.find((i) => i.id === taskId)?.version
}

/** Task-level writes. Status toggles and deletes are optimistic with rollback. */
export function useTaskActions(projectId: string, { sprints, refetchSprints, mutateSprints }: Deps) {
  const { t } = useLanguage()
  const toast = useToast()
  const confirm = useConfirm()
  const onVersionConflict = useVersionConflict()
  const tasksUrl = (sprintId: string) => `/api/projects/${projectId}/sprints/${sprintId}/tasks`
  const versionOf = (sprintId: string, taskId: string) => taskVersion(sprints, sprintId, taskId)
  // Someone else changed the task first: toast, then reload the sprints (the
  // task DTO in `current` lacks the sprint-level i18n, so a refetch is simplest).
  const conflictReloads = (err: unknown, onConflict?: (current: SprintItem | null) => void) =>
    onVersionConflict<SprintItem>(err, (current) => {
      refetchSprints()
      onConflict?.(current)
    })

  /** Leaving "done" asks first (the finished state and its timestamp are dropped; the comment is kept). */
  async function confirmReopen(sprintId: string, taskId: string, next: string | undefined): Promise<boolean> {
    const current = sprints.find((s) => s.id === sprintId)?.items.find((i) => i.id === taskId)
    if (current?.status !== "done" || !next || next === "done") return true
    return confirm({ message: t.sprintReopenTaskConfirm, confirmLabel: t.sprintReopenTaskLabel, cancelLabel: t.cancel })
  }

  /** `onConflict` receives the server's row on a 409 so an open editor can show it. */
  async function saveTask(
    sprintId: string, taskId: string | null, form: TaskFormState, onConflict?: (current: SprintItem | null) => void,
  ): Promise<boolean> {
    if (taskId && !(await confirmReopen(sprintId, taskId, form.status))) return false
    try {
      if (taskId) {
        await apiFetch(`${tasksUrl(sprintId)}/${taskId}`, {
          method: "PATCH",
          json: withVersion(buildTaskPatch(form), versionOf(sprintId, taskId)),
        })
      } else {
        await apiFetch(tasksUrl(sprintId), { method: "POST", json: buildTaskCreate(form) })
      }
      refetchSprints()
      return true
    } catch (err) {
      if (conflictReloads(err, onConflict)) return false
      toast.error(messageOf(err, t.error), { title: taskId ? t.sprintUpdateFailed : t.sprintAddFailed })
      return false
    }
  }

  /** In-place edit of one task (name, estimate, owner). Reloads so translations and assignee names are fresh. */
  async function patchTaskFields(sprintId: string, taskId: string, patch: TaskFieldPatch): Promise<boolean> {
    try {
      await apiFetch(`${tasksUrl(sprintId)}/${taskId}`, { method: "PATCH", json: withVersion({ ...patch }, versionOf(sprintId, taskId)) })
      refetchSprints()
      return true
    } catch (err) {
      if (conflictReloads(err)) return false
      toast.error(messageOf(err, t.error), { title: t.sprintUpdateFailed })
      return false
    }
  }

  /** The quick-add row: one named, unassigned task under a PBI. */
  async function quickAddTask(sprintId: string, pbItemId: string, taskName: string): Promise<boolean> {
    const name = taskName.trim()
    if (!name) return false
    try {
      await apiFetch(tasksUrl(sprintId), { method: "POST", json: { pbItemId, taskName: name, assigneeIds: [], estimatedHours: null } })
      refetchSprints()
      return true
    } catch (err) {
      toast.error(messageOf(err, t.error), { title: t.sprintAddFailed })
      return false
    }
  }

  async function bulkAddTasks(sprintId: string, pbItemId: string, assigneeIds: string[], taskNames: string[]): Promise<boolean> {
    if (!sprintId || !pbItemId || taskNames.length === 0) return false
    const results = await Promise.allSettled(
      taskNames.map((taskName) =>
        apiFetch(tasksUrl(sprintId), { method: "POST", json: { pbItemId, taskName, assigneeIds, estimatedHours: null } }),
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
    const version = versionOf(sprintId, taskId)
    mutateSprints(removeTask(sprints, sprintId, taskId))
    try {
      await apiFetch(`${tasksUrl(sprintId)}/${taskId}${versionParam(version)}`, { method: "DELETE" })
      refetchSprints()
    } catch (err) {
      mutateSprints(snapshot)
      if (conflictReloads(err)) return
      toast.error(messageOf(err, t.error), { title: t.sprintTaskDeleteFailed })
    }
  }

  async function quickUpdateTaskStatus(sprintId: string, taskId: string, status: string, completionComment?: string | null) {
    if (!(await confirmReopen(sprintId, taskId, status))) return
    const body: Record<string, unknown> = { status }
    if (status === "done" && completionComment !== undefined) body.completionComment = completionComment
    const snapshot = sprints
    const version = versionOf(sprintId, taskId)
    mutateSprints(patchTask(sprints, sprintId, taskId, body))
    try {
      const saved = await apiFetch<Pick<SprintItem, "version"> | undefined>(`${tasksUrl(sprintId)}/${taskId}`, {
        method: "PATCH",
        json: withVersion(body, version),
      })
      // The optimistic patch already shows the new status and every in-card
      // metric is derived client-side, so no full reload of all sprints —
      // only the new version is kept for the next write. Only a finished
      // sprint's stored actualScore (average shown in the header) needs the
      // server's recalculation.
      if (typeof saved?.version === "number") {
        const next = saved.version
        mutateSprints((prev) => prev && patchTask(prev, sprintId, taskId, { version: next }))
      }
      if (isFinishedSprint(sprints.find((s) => s.id === sprintId))) refetchSprints()
    } catch (err) {
      mutateSprints(snapshot)
      if (conflictReloads(err)) return
      toast.error(messageOf(err, t.error), { title: t.sprintTaskStatusFailed })
    }
  }

  async function editCompletionComment(sprintId: string, taskId: string, comment: string): Promise<boolean> {
    // Empty string collapses to null so the comment block disappears.
    const completionComment = comment.trim() ? comment : null
    try {
      await apiFetch(`${tasksUrl(sprintId)}/${taskId}`, {
        method: "PATCH",
        json: withVersion({ completionComment }, versionOf(sprintId, taskId)),
      })
      refetchSprints()
      return true
    } catch (err) {
      if (conflictReloads(err)) return false
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

  return { saveTask, patchTaskFields, quickAddTask, bulkAddTasks, deleteTask, quickUpdateTaskStatus, editCompletionComment, sendToIcebox }
}
