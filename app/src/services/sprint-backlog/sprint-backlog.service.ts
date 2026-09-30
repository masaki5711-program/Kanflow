import type { Prisma } from "@/generated/prisma/client"
import { syncPbiStatusFromTasks } from "@/lib/pbi-status-sync"
import { recalcSprintActualScore } from "@/lib/sprint-score"
import type { Actor } from "@/services/_shared/actor"
import { withTransaction, type Db } from "@/services/_shared/db"
import { NotFoundError } from "@/services/_shared/errors"
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

/**
 * Attach PBIs to a sprint as placeholder rows. PBIs outside the project or
 * already in the sprint are skipped; `added === 0` → nothing changed.
 */
export async function addPbisToSprint(projectId: string, sprintId: string, pbIds: readonly string[]) {
  return withTransaction(async (tx) => {
    const sprint = await repo.findSprintPbiIds(tx, projectId, sprintId)
    if (!sprint) throw new NotFoundError(SPRINT_MISSING, {}, "SPRINT_NOT_FOUND")
    const existing = new Set(sprint.items.map((i) => i.pbItemId))
    const valid = await repo.findProjectPbiIds(tx, projectId, pbIds)
    const toAdd = valid.map((p) => p.id).filter((id) => !existing.has(id))
    if (toAdd.length === 0) return { added: 0, skipped: pbIds.length }
    await repo.insertPlaceholders(tx, sprintId, toAdd)
    await recalcSprintActualScore(sprintId, tx)
    const items = await repo.findPlaceholders(tx, sprintId, toAdd)
    return { added: toAdd.length, skipped: pbIds.length - toAdd.length, items }
  })
}

/** Detach a PBI: removes its placeholder AND its tasks in this sprint (with their translations). */
export async function removePbiFromSprint(projectId: string, sprintId: string, pbItemId: string) {
  return withTransaction(async (tx) => {
    if (!(await repo.findSprintId(tx, projectId, sprintId))) throw new NotFoundError(SPRINT_MISSING, {}, "SPRINT_NOT_FOUND")
    const rows = await repo.findSprintRowsOfPbi(tx, sprintId, pbItemId)
    const res = await repo.deleteSprintRowsOfPbi(tx, sprintId, pbItemId)
    await purgeIn(tx, { sprint_task: rows.map((r) => r.id) })
    await afterTaskChange(tx, sprintId, pbItemId)
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
    return task
  })
}

export async function updateTask(projectId: string, sprintId: string, taskId: string, input: UpdateTaskInput, actor: Actor) {
  const data = await prepareText(input, actor.userId)
  const task = await withTransaction(async (tx) => {
    if (!(await repo.findTask(tx, projectId, sprintId, taskId))) throw new NotFoundError()
    const patch = buildTaskUpdate(data)
    const updated = await repo.updateTask(tx, taskId, patch)
    await afterTaskChange(tx, sprintId, updated.pbItemId)
    await enqueueIn(tx, "sprint_task", updated.id, {
      taskName: data.taskName,
      completionComment: patch.completionComment as string | null | undefined,
    })
    return updated
  })
  return attachI18nOne("sprint_task", task)
}

export async function deleteTask(projectId: string, sprintId: string, taskId: string): Promise<void> {
  await withTransaction(async (tx) => {
    const existing = await repo.findTask(tx, projectId, sprintId, taskId)
    if (!existing) throw new NotFoundError()
    await repo.deleteTask(tx, taskId)
    await purgeIn(tx, { sprint_task: [taskId] })
    await afterTaskChange(tx, sprintId, existing.pbItemId)
  })
}
