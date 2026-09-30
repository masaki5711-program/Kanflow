import type { Prisma } from "@/generated/prisma/client"
import type { Db } from "@/services/_shared/db"

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
  return db.productBacklogItem.findMany({ where: { id: { in: [...pbIds] }, projectId }, select: { id: true } })
}

export function findProjectPbiId(db: Db, projectId: string, pbItemId: string) {
  return db.productBacklogItem.findFirst({ where: { id: pbItemId, projectId }, select: { id: true } })
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
    where: { id: taskId, sprintId, sprint: { projectId } },
    select: { id: true, pbItemId: true },
  })
}

export function updateTask(db: Db, taskId: string, data: Prisma.SprintBacklogItemUncheckedUpdateInput) {
  return db.sprintBacklogItem.update({ where: { id: taskId }, data, include: { pbItem: true } })
}

export function deleteTask(db: Db, taskId: string) {
  return db.sprintBacklogItem.delete({ where: { id: taskId } })
}
