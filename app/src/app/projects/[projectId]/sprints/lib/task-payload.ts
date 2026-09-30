// Request-body builders for the sprint page (pure → unit-tested).
import type { RetroFields, Sprint, SprintItem, StatusDialogState, TaskFormState } from "../components/types"

export const EMPTY_TASK_FORM: TaskFormState = {
  pbItemId: "", taskName: "", assignee: "", estimatedHours: "", actualHours: "", status: "todo",
}

export function taskFormFromItem(task: SprintItem): TaskFormState {
  return {
    pbItemId: task.pbItem.id,
    taskName: task.taskName ?? "",
    assignee: task.assignee ?? "",
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

/** PATCH body for an existing task. Empty hours clear the value (null). */
export function buildTaskPatch(form: TaskFormState): Record<string, unknown> {
  return {
    ...(form.taskName ? { taskName: form.taskName } : {}),
    assignee: form.assignee || null,
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
    assignee: form.assignee || null,
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
