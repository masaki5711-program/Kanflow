import type { Prisma } from "@/generated/prisma/client"
import type { Db } from "@/services/_shared/db"
import { LIST_LIMITS } from "@/services/_shared/limits"

export function findPlanItems(db: Db, projectId: string) {
  return db.planItem.findMany({
    where: { projectId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    take: LIST_LIMITS.planItems,
  })
}

/** id / parentId of every plan row in the project (cycle checks, subtree collection). */
export function findPlanTree(db: Db, projectId: string) {
  return db.planItem.findMany({ where: { projectId }, select: { id: true, parentId: true } })
}

export function findPlanItem(db: Db, projectId: string, itemId: string) {
  return db.planItem.findFirst({ where: { id: itemId, projectId }, select: { id: true, parentId: true } })
}

export async function nextPlanSortOrder(db: Db, projectId: string, parentId: string | null): Promise<number> {
  const agg = await db.planItem.aggregate({ where: { projectId, parentId }, _max: { sortOrder: true } })
  return (agg._max.sortOrder ?? 0) + 1
}

export function insertPlanItem(db: Db, data: Prisma.PlanItemUncheckedCreateInput) {
  return db.planItem.create({ data })
}

export function updatePlanItem(db: Db, itemId: string, data: Prisma.PlanItemUncheckedUpdateInput) {
  return db.planItem.update({ where: { id: itemId }, data })
}

export function countPlanChildren(db: Db, itemId: string) {
  return db.planItem.count({ where: { parentId: itemId } })
}

export function deletePlanItem(db: Db, itemId: string) {
  return db.planItem.delete({ where: { id: itemId } })
}

export function findPlanItemsByIds(db: Db, projectId: string, ids: readonly string[]) {
  return db.planItem.findMany({ where: { id: { in: [...ids] }, projectId }, select: { id: true, parentId: true } })
}
