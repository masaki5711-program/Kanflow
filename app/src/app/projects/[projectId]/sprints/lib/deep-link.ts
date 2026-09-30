// Deep links into the sprint page (?task=<taskId>, ?sprint=<sprintId>): element ids + lookups (pure).
import { isRealTask } from "./sprint-metrics"

interface SprintLike {
  id: string
  items: ReadonlyArray<{ id: string; taskName: string | null }>
}

/** `id` of a task row (list view) / task card (board view). */
export function taskElementId(taskId: string): string {
  return `task-${taskId}`
}

/** `id` of a sprint card's list item. */
export function sprintElementId(sprintId: string): string {
  return `sprint-card-${sprintId}`
}

/** The sprint holding the task (PBI placeholder rows are not tasks). */
export function findSprintOfTask<S extends SprintLike>(sprints: readonly S[], taskId: string): S | undefined {
  return sprints.find((s) => s.items.some((i) => i.id === taskId && isRealTask(i)))
}

export function findSprintById<S extends { id: string }>(sprints: readonly S[], sprintId: string): S | undefined {
  return sprints.find((s) => s.id === sprintId)
}
