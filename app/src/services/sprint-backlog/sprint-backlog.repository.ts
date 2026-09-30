import type { Prisma } from "@/generated/prisma/client"
import type { Db } from "@/services/_shared/db"
import { LIVE_PBI, notDeleted } from "@/services/_shared/soft-delete"
import { BUMP_VERSION, versionWhere } from "@/services/_shared/versioning"
import { ASSIGNEES_INCLUDE } from "./task-assignees"

export function findSprintPbiIds(db: Db, projectId: string, sprintId: string) {
  return db.sprint.findFirst({
    where: { id: sprintId, projectId },
    select: { id: true, items: { select: { pbItemId: true } } },
  })
}

export function findSprintId(db: Db, projectId: string, sprintId: string) {
  return db.sprint.findFirst({ where: { id: sprintId, projectId }, select: { id: true } })
}

export function findProjectPbiIds(db: Db, projectId: string, pbIds: readonly string[]) {
  return db.productBacklogItem.findMany({ where: notDeleted({ id: { in: [...pbIds] }, projectId }), select: { id: true } })
}

export function findProjectPbiId(db: Db, projectId: string, pbItemId: string) {
  return db.productBacklogItem.findFirst({ where: notDeleted({ id: pbItemId, projectId }), select: { id: true } })
}

/** One placeholder row (taskName NULL) per PBI = "this PBI is in the sprint". */
export function insertPlaceholders(db: Db, sprintId: string, pbItemIds: readonly string[]) {
  return db.sprintBacklogItem.createMany({
    data: pbItemIds.map((pbItemId) => ({ sprintId, pbItemId, status: "todo" })),
  })
}

export function findPlaceholders(db: Db, sprintId: string, pbItemIds: readonly string[]) {
  return db.sprintBacklogItem.findMany({
    where: { sprintId, pbItemId: { in: [...pbItemIds] }, taskName: null },
    include: { pbItem: true },
  })
}

/** All rows (placeholder + tasks) of one PBI in one sprint. */
export function findSprintRowsOfPbi(db: Db, sprintId: string, pbItemId: string) {
  return db.sprintBacklogItem.findMany({ where: { sprintId, pbItemId }, select: { id: true } })
}

export function deleteSprintRowsOfPbi(db: Db, sprintId: string, pbItemId: string) {
  return db.sprintBacklogItem.deleteMany({ where: { sprintId, pbItemId } })
}

export function insertTask(db: Db, data: Prisma.SprintBacklogItemUncheckedCreateInput) {
  return db.sprintBacklogItem.create({ data, include: { pbItem: true } })
}

export function findTask(db: Db, projectId: string, sprintId: string, taskId: string) {
  return db.sprintBacklogItem.findFirst({
    // A task of a trashed PBI is hidden, so it cannot be edited or deleted either.
    where: { id: taskId, sprintId, sprint: { projectId }, ...LIVE_PBI },
    select: { id: true, pbItemId: true },
  })
}

/** Optimistic-lock update (matches `version` when given, always bumps it). Rows updated: 0 or 1. */
export async function updateTask(
  db: Db,
  taskId: string,
  data: Prisma.SprintBacklogItemUncheckedUpdateInput,
  version?: number
): Promise<number> {
  const res = await db.sprintBacklogItem.updateMany({
    where: { id: taskId, ...versionWhere(version) },
    data: { ...data, ...BUMP_VERSION },
  })
  return res.count
}

/** A task with its PBI and assignees (the task DTO before flattening). */
export function findTaskDetail(db: Db, taskId: string) {
  return db.sprintBacklogItem.findFirst({
    where: { id: taskId },
    include: { pbItem: true, assignees: ASSIGNEES_INCLUDE },
  })
}

/** Delete at `version` (when given); TaskAssignee rows cascade. Rows deleted: 0 or 1. */
export async function deleteTask(db: Db, taskId: string, version?: number): Promise<number> {
  const res = await db.sprintBacklogItem.deleteMany({ where: { id: taskId, ...versionWhere(version) } })
  return res.count
}

/** The project's members as assignee candidates ({ id: userId, name }). */
export async function findProjectMemberCandidates(db: Db, projectId: string) {
  const rows = await db.projectMember.findMany({
    where: { projectId },
    select: { userId: true, user: { select: { name: true } } },
  })
  return rows.map((r) => ({ id: r.userId, name: r.user.name }))
}

/** User ids currently in TaskAssignee for the task (assignment order). */
export async function findTaskAssigneeIds(db: Db, taskId: string): Promise<string[]> {
  const rows = await db.taskAssignee.findMany({ where: { taskId }, select: { userId: true }, orderBy: { createdAt: "asc" } })
  return rows.map((r) => r.userId)
}

/** Replace the task's TaskAssignee set (same transaction as the task write). */
export async function replaceTaskAssignees(db: Db, taskId: string, userIds: readonly string[]): Promise<void> {
  await db.taskAssignee.deleteMany({ where: { taskId } })
  if (userIds.length > 0) {
    await db.taskAssignee.createMany({ data: userIds.map((userId) => ({ taskId, userId })), skipDuplicates: true })
  }
}
