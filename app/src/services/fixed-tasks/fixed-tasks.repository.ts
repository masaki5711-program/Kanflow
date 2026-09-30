import type { Db } from "@/services/_shared/db"
import { LIST_LIMITS } from "@/services/_shared/limits"
import type { UpdateFixedTaskInput } from "./fixed-tasks.schemas"

const ORDER = [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }]

export function findGroups(db: Db, userId: string) {
  return db.userFixedTask.findMany({
    where: { userId },
    orderBy: ORDER,
    include: { items: { orderBy: ORDER } },
    take: LIST_LIMITS.fixedTasks,
  })
}

export async function nextGroupSortOrder(db: Db, userId: string): Promise<number> {
  const agg = await db.userFixedTask.aggregate({ where: { userId }, _max: { sortOrder: true } })
  return (agg._max.sortOrder ?? 0) + 1
}

export function insertGroup(db: Db, data: { userId: string; taskName: string; sortOrder: number }) {
  return db.userFixedTask.create({ data, include: { items: true } })
}

export function findOwnedGroup(db: Db, userId: string, groupId: string) {
  return db.userFixedTask.findFirst({ where: { id: groupId, userId }, select: { id: true } })
}

export function updateGroup(db: Db, groupId: string, data: UpdateFixedTaskInput) {
  return db.userFixedTask.update({ where: { id: groupId }, data })
}

export function findItemIdsOfGroup(db: Db, groupId: string) {
  return db.userFixedTaskItem.findMany({ where: { groupId }, select: { id: true } })
}

export function deleteGroup(db: Db, groupId: string) {
  return db.userFixedTask.delete({ where: { id: groupId } })
}

export async function nextItemSortOrder(db: Db, groupId: string): Promise<number> {
  const agg = await db.userFixedTaskItem.aggregate({ where: { groupId }, _max: { sortOrder: true } })
  return (agg._max.sortOrder ?? 0) + 1
}

export function insertItem(db: Db, data: { groupId: string; taskName: string; sortOrder: number }) {
  return db.userFixedTaskItem.create({ data })
}

export function findOwnedItem(db: Db, userId: string, groupId: string, itemId: string) {
  return db.userFixedTaskItem.findFirst({
    where: { id: itemId, groupId, group: { userId } },
    select: { id: true },
  })
}

export function updateItem(db: Db, itemId: string, data: UpdateFixedTaskInput) {
  return db.userFixedTaskItem.update({ where: { id: itemId }, data })
}

export function deleteItem(db: Db, itemId: string) {
  return db.userFixedTaskItem.delete({ where: { id: itemId } })
}
