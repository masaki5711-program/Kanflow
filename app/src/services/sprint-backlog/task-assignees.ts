/**
 * Sprint-task assignees (P2 userId normalization) — pure planning of the
 * dual-write between the normalized TaskAssignee rows and the legacy
 * `SprintBacklogItem.assignee` string (kept for backward compatibility until
 * every reader uses TaskAssignee; see docs/operations/deploy.md for the
 * backfill of old rows).
 *
 * - `assigneeIds` given → validated against the project's members; the set is
 *   replaced and the legacy string becomes the names joined by ", ".
 * - only the legacy `assignee` string given → it is stored as sent and the
 *   names that resolve to project members are synced into TaskAssignee.
 */
import { resolveAssignees, type AssigneeCandidate } from "@/lib/assignees"
import { ValidationError } from "@/services/_shared/errors"

/** A task assignee as sent to the client. */
export interface AssigneeRef {
  id: string
  name: string
}

/** Upper bound of assignees per task (API guard). */
export const MAX_TASK_ASSIGNEES = 20

/** Prisma include of a task's assignees (stable order: assignment time). */
export const ASSIGNEES_INCLUDE = {
  select: { user: { select: { id: true, name: true } } },
  orderBy: { createdAt: "asc" },
} as const

export interface AssigneeInput {
  assigneeIds?: readonly string[]
  assignee?: string | null
}

/** What to write: the legacy string and the TaskAssignee set (in order). */
export interface AssigneeWrite {
  assignee: string | null
  assignees: AssigneeRef[]
}

/** True when the input changes the assignees at all. */
export function touchesAssignees(input: AssigneeInput): boolean {
  return input.assigneeIds !== undefined || input.assignee !== undefined
}

function fromIds(ids: readonly string[], members: readonly AssigneeCandidate[]): AssigneeWrite {
  const unique = [...new Set(ids)]
  if (unique.length > MAX_TASK_ASSIGNEES) {
    throw new ValidationError(`担当者は最大 ${MAX_TASK_ASSIGNEES} 人です`, {}, "VALIDATION")
  }
  const byId = new Map(members.map((m) => [m.id, m]))
  const invalid = unique.filter((id) => !byId.has(id))
  if (invalid.length > 0) {
    throw new ValidationError("担当者はプロジェクトメンバーから選択してください", { invalidAssigneeIds: invalid }, "VALIDATION")
  }
  const assignees = unique.map((id) => ({ id, name: byId.get(id)!.name }))
  return { assignee: assignees.map((a) => a.name).join(", ") || null, assignees }
}

function fromLegacy(raw: string | null, members: readonly AssigneeCandidate[]): AssigneeWrite {
  const { userIds } = resolveAssignees(raw, members)
  const byId = new Map(members.map((m) => [m.id, m.name]))
  return { assignee: raw, assignees: userIds.map((id) => ({ id, name: byId.get(id) ?? "" })) }
}

/**
 * Pure: the dual-write for an assignee change, or null when the input does
 * not touch assignees. `assigneeIds` wins over a legacy string sent with it.
 * Throws 400 for ids outside the project's members.
 */
export function planAssigneeWrite(input: AssigneeInput, members: readonly AssigneeCandidate[]): AssigneeWrite | null {
  if (input.assigneeIds !== undefined) return fromIds(input.assigneeIds, members)
  if (input.assignee !== undefined) return fromLegacy(input.assignee, members)
  return null
}

/**
 * Pure: who was assigned before a change — the TaskAssignee rows, or (for a
 * task not backfilled yet) the legacy string resolved against the members.
 */
export function previousAssigneeIds(
  existingIds: readonly string[],
  legacy: string | null | undefined,
  members: readonly AssigneeCandidate[]
): string[] {
  if (existingIds.length > 0) return [...existingIds]
  return resolveAssignees(legacy, members).userIds
}

type AssigneeRow = { user: AssigneeRef }

export function flattenAssignees(rows: readonly AssigneeRow[] | null | undefined): AssigneeRef[] {
  return (rows ?? []).map((r) => ({ id: r.user.id, name: r.user.name }))
}

/** Task row → DTO with `assignees: [{id, name}]` (new object; [] when the relation was not loaded). */
export function withAssigneeRefs<T extends object>(task: T): Omit<T, "assignees"> & { assignees: AssigneeRef[] } {
  const rows = (task as { assignees?: readonly AssigneeRow[] }).assignees
  return { ...task, assignees: flattenAssignees(rows) }
}
