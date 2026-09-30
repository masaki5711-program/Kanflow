import type { Prisma } from "@/generated/prisma/client"
import { syncPbiStatusFromTasks } from "@/lib/pbi-status-sync"
import { recalcSprintActualScore } from "@/lib/sprint-score"
import type { Actor } from "@/services/_shared/actor"
import { loadSnapshot, logActivity, logCreate, logDelete, logUpdate } from "@/services/_shared/activity"
import { withTransaction, type Db } from "@/services/_shared/db"
import { NotFoundError } from "@/services/_shared/errors"
import { newlyAssignedUserIds, notify, resolveAssigneeUserIds } from "@/services/_shared/notifications"
import { attachI18nOne, enqueueIn, prepareText, purgeIn } from "@/services/_shared/translations"
import * as repo from "./sprint-backlog.repository"
import type { CreateTaskInput, UpdateTaskInput } from "./sprint-backlog.schemas"

const SPRINT_MISSING = "Sprint not found"

/**
 * A task has exactly ONE owner (責任所在の明確化). The column historically held
 * comma-separated names, so multi-name input is normalized to the first name.
 */
export function singleAssignee(v: string | null | undefined): string | null {
  if (!v) return null
  return v.split(",")[0].trim() || null
}

/**
 * Pure: PATCH payload for a task. "done" stamps completedAt; any other
 * explicit status clears it and (unless given) the completion comment.
 */
export function buildTaskUpdate(data: UpdateTaskInput): Prisma.SprintBacklogItemUncheckedUpdateInput {
  const base: Prisma.SprintBacklogItemUncheckedUpdateInput = {
    ...data,
    ...(typeof data.assignee === "string" ? { assignee: singleAssignee(data.assignee) } : {}),
  }
  if (data.status === "done") return { ...base, completedAt: new Date() }
  if (!data.status) return base
  return {
    ...base,
    completedAt: null,
    ...(data.completionComment === undefined ? { completionComment: null } : {}),
  }
}

/** Score + PBI status follow every task change (same transaction). */
async function afterTaskChange(tx: Db, sprintId: string, pbItemId: string | null): Promise<void> {
  await recalcSprintActualScore(sprintId, tx)
  if (pbItemId) await syncPbiStatusFromTasks(pbItemId, tx)
}

interface AssignedTask {
  id: string
  sprintId: string
  taskName: string | null
}

/** "assigned" notification for the users newly responsible for a task (same transaction). */
async function notifyTaskAssigned(tx: Db, projectId: string, task: AssignedTask, userIds: readonly string[], actor: Actor | null) {
  if (userIds.length === 0) return
  await notify(tx, {
    recipientIds: userIds,
    actorId: actor?.userId,
    type: "assigned",
    projectId,
    entityType: "sprint_task",
    entityId: task.id,
    payload: { entityLabel: task.taskName, sprintId: task.sprintId, actorName: actor?.userName ?? null },
  })
}

/** One "move" row per PBI entering (`to`) or leaving (`from`) a sprint. */
async function logPbiMoves(tx: Db, projectId: string, pbIds: readonly string[], move: { from: string | null; to: string | null }, actor: Actor | null) {
  for (const pbId of pbIds) {
    await logActivity(tx, {
      projectId,
      entityType: "pbi",
      entityId: pbId,
      action: "move",
      actor,
      diff: { changes: { sprintId: move } },
    })
  }
}

/**
 * Attach PBIs to a sprint as placeholder rows. PBIs outside the project or
 * already in the sprint are skipped; `added === 0` → nothing changed.
 */
export async function addPbisToSprint(projectId: string, sprintId: string, pbIds: readonly string[], actor: Actor | null = null) {
  return withTransaction(async (tx) => {
    const sprint = await repo.findSprintPbiIds(tx, projectId, sprintId)
    if (!sprint) throw new NotFoundError(SPRINT_MISSING, {}, "SPRINT_NOT_FOUND")
    const existing = new Set(sprint.items.map((i) => i.pbItemId))
    const valid = await repo.findProjectPbiIds(tx, projectId, pbIds)
    const toAdd = valid.map((p) => p.id).filter((id) => !existing.has(id))
    if (toAdd.length === 0) return { added: 0, skipped: pbIds.length }
    await repo.insertPlaceholders(tx, sprintId, toAdd)
    await recalcSprintActualScore(sprintId, tx)
    await logPbiMoves(tx, projectId, toAdd, { from: null, to: sprintId }, actor)
    const items = await repo.findPlaceholders(tx, sprintId, toAdd)
    return { added: toAdd.length, skipped: pbIds.length - toAdd.length, items }
  })
}

/** Detach a PBI: removes its placeholder AND its tasks in this sprint (with their translations). */
export async function removePbiFromSprint(projectId: string, sprintId: string, pbItemId: string, actor: Actor | null = null) {
  return withTransaction(async (tx) => {
    if (!(await repo.findSprintId(tx, projectId, sprintId))) throw new NotFoundError(SPRINT_MISSING, {}, "SPRINT_NOT_FOUND")
    const rows = await repo.findSprintRowsOfPbi(tx, sprintId, pbItemId)
    const res = await repo.deleteSprintRowsOfPbi(tx, sprintId, pbItemId)
    await purgeIn(tx, { sprint_task: rows.map((r) => r.id) })
    await afterTaskChange(tx, sprintId, pbItemId)
    if (res.count > 0) await logPbiMoves(tx, projectId, [pbItemId], { from: sprintId, to: null }, actor)
    return { removed: res.count }
  })
}

export async function createTask(projectId: string, sprintId: string, input: CreateTaskInput, actor: Actor) {
  const data = await prepareText(input, actor.userId)
  return withTransaction(async (tx) => {
    if (!(await repo.findSprintId(tx, projectId, sprintId))) throw new NotFoundError("Not found", {}, "SPRINT_NOT_FOUND")
    if (!(await repo.findProjectPbiId(tx, projectId, data.pbItemId))) throw new NotFoundError("PBI not found", {}, "PBI_NOT_FOUND")
    const task = await repo.insertTask(tx, {
      sprintId,
      pbItemId: data.pbItemId,
      taskName: data.taskName,
      assignee: singleAssignee(data.assignee),
      estimatedHours: data.estimatedHours ?? null,
      status: "todo",
    })
    await afterTaskChange(tx, sprintId, data.pbItemId)
    await enqueueIn(tx, "sprint_task", task.id, task)
    await logCreate(tx, { projectId, entityType: "sprint_task", entityId: task.id, actor, row: task, meta: { sprintId, pbItemId: task.pbItemId } })
    await notifyTaskAssigned(tx, projectId, task, await resolveAssigneeUserIds(tx, projectId, task.assignee), actor)
    return task
  })
}

export async function updateTask(projectId: string, sprintId: string, taskId: string, input: UpdateTaskInput, actor: Actor) {
  const data = await prepareText(input, actor.userId)
  const task = await withTransaction(async (tx) => {
    if (!(await repo.findTask(tx, projectId, sprintId, taskId))) throw new NotFoundError()
    const before = await loadSnapshot(tx, "sprint_task", taskId)
    const patch = buildTaskUpdate(data)
    const updated = await repo.updateTask(tx, taskId, patch)
    await afterTaskChange(tx, sprintId, updated.pbItemId)
    await enqueueIn(tx, "sprint_task", updated.id, {
      taskName: data.taskName,
      completionComment: patch.completionComment as string | null | undefined,
    })
    const ref = { projectId, entityType: "sprint_task", entityId: taskId, actor, meta: { sprintId, pbItemId: updated.pbItemId } } as const
    const changes = await logUpdate(tx, { ...ref, before, after: updated })
    if (changes.assignee) {
      const userIds = await newlyAssignedUserIds(tx, projectId, before?.assignee as string | null | undefined, updated.assignee)
      await notifyTaskAssigned(tx, projectId, updated, userIds, actor)
    }
    return updated
  })
  return attachI18nOne("sprint_task", task)
}

export async function deleteTask(projectId: string, sprintId: string, taskId: string, actor: Actor | null = null): Promise<void> {
  await withTransaction(async (tx) => {
    const existing = await repo.findTask(tx, projectId, sprintId, taskId)
    if (!existing) throw new NotFoundError()
    const row = await loadSnapshot(tx, "sprint_task", taskId)
    await repo.deleteTask(tx, taskId)
    await logDelete(tx, { projectId, entityType: "sprint_task", entityId: taskId, actor, row, meta: { sprintId, pbItemId: existing.pbItemId } })
    await purgeIn(tx, { sprint_task: [taskId] })
    await afterTaskChange(tx, sprintId, existing.pbItemId)
  })
}
