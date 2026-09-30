// Request-body builders for the sprint page (pure → unit-tested).
import { splitAssigneeNames } from "@/lib/assignees"
import type { Member, RetroFields, Sprint, SprintItem, StatusDialogState, TaskFormState } from "../components/types"

export const EMPTY_TASK_FORM: TaskFormState = {
  pbItemId: "", taskName: "", assigneeIds: [], loadedAssigneeIds: null, estimatedHours: "", actualHours: "", status: "todo",
}

/**
 * The task's assignee ids: the normalized `assignees`, or — for a task not
 * backfilled yet — the members whose name appears verbatim in the legacy string.
 */
export function assigneeIdsOf(task: SprintItem, members: readonly Member[]): string[] {
  if (task.assignees && task.assignees.length > 0) return task.assignees.map((a) => a.id)
  const names = new Set(splitAssigneeNames(task.assignee))
  return members.filter((m) => names.has(m.user.name)).map((m) => m.user.id)
}

/** Assignee chips of a task row: normalized names, else the legacy comma-separated string. */
export function displayAssignees(task: SprintItem): { key: string; name: string }[] {
  if (task.assignees && task.assignees.length > 0) return task.assignees.map((a) => ({ key: a.id, name: a.name }))
  return splitAssigneeNames(task.assignee).map((name) => ({ key: name, name }))
}

export function taskFormFromItem(task: SprintItem, members: readonly Member[] = []): TaskFormState {
  return {
    pbItemId: task.pbItem.id,
    taskName: task.taskName ?? "",
    assigneeIds: assigneeIdsOf(task, members),
    loadedAssigneeIds: assigneeIdsOf(task, members),
    estimatedHours: task.estimatedHours?.toString() ?? "",
    actualHours: task.actualHours?.toString() ?? "",
    status: task.status,
  }
}

function hours(value: string): number | null {
  if (!value) return null
  const n = parseFloat(value)
  return Number.isFinite(n) ? n : null
}

function sameValue(a: TaskFormState[keyof TaskFormState], b: TaskFormState[keyof TaskFormState]): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => v === b[i])
  return a === b
}

/** True when any field differs from the loaded form (assignee ids compared by value). */
export function isTaskFormDirty(form: TaskFormState, initial: TaskFormState): boolean {
  return (Object.keys(initial) as (keyof TaskFormState)[]).some((k) => !sameValue(form[k], initial[k]))
}

/**
 * PATCH body for an existing task. Empty hours clear the value (null);
 * `assigneeIds` is sent only when changed ([] unassigns).
 */
export function buildTaskPatch(form: TaskFormState): Record<string, unknown> {
  const assigneesChanged = form.loadedAssigneeIds === null || !sameValue(form.assigneeIds, form.loadedAssigneeIds)
  return {
    ...(form.taskName ? { taskName: form.taskName } : {}),
    ...(assigneesChanged ? { assigneeIds: form.assigneeIds } : {}),
    estimatedHours: hours(form.estimatedHours),
    actualHours: hours(form.actualHours),
    ...(form.status ? { status: form.status } : {}),
  }
}

/** POST body for a new task. */
export function buildTaskCreate(form: TaskFormState): Record<string, unknown> {
  return {
    pbItemId: form.pbItemId,
    taskName: form.taskName,
    assigneeIds: form.assigneeIds,
    estimatedHours: hours(form.estimatedHours),
  }
}

const RETRO_KEYS = ["reviewComment", "retrospectiveMemo", "retrospectiveKeep", "retrospectiveProblem", "retrospectiveTry"] as const

/** PATCH body for a status change; retro fields are sent with "" collapsed to null. */
export function buildStatusPatch(status: string, retro: Partial<RetroFields> | null): Record<string, unknown> {
  const body: Record<string, unknown> = { status }
  if (!retro) return body
  for (const k of RETRO_KEYS) {
    if (retro[k] !== undefined) body[k] = retro[k] || null
  }
  return body
}

export function statusDialogFor(sprint: Sprint, nextStatus: string): StatusDialogState {
  return {
    sprintId: sprint.id,
    sprintName: sprint.sprintName,
    nextStatus,
    reviewComment: sprint.reviewComment ?? "",
    retrospectiveMemo: sprint.retrospectiveMemo ?? "",
    retrospectiveKeep: sprint.retrospectiveKeep ?? "",
    retrospectiveProblem: sprint.retrospectiveProblem ?? "",
    retrospectiveTry: sprint.retrospectiveTry ?? "",
  }
}

/** Status transitions that require the review / retrospective dialog. */
export function needsRetroDialog(nextStatus: string): boolean {
  return nextStatus === "review" || nextStatus === "done"
}
