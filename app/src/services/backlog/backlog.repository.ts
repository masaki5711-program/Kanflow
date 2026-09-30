import type { Prisma } from "@/generated/prisma/client"
import type { Db } from "@/services/_shared/db"
import { LIST_LIMITS } from "@/services/_shared/limits"
import type { PbiStatus } from "./backlog.schemas"

const LINKED_SELECT = {
  iceboxItem: { select: { id: true, displayId: true, request: true } },
  productGoal: { select: { id: true, title: true } },
} as const

/** `status` narrows the list server-side (e.g. sprint planning only needs "ready"). */
export function findBacklogItems(db: Db, projectId: string, status?: PbiStatus) {
  return db.productBacklogItem.findMany({
    where: status ? { projectId, status } : { projectId },
    include: {
      ...LINKED_SELECT,
      // Sprints currently working on this PBI (planning/active only) so the
      // backlog list can mark Ready items that are already picked up.
      sprintItems: {
        where: { sprint: { status: { in: ["planning", "active"] } } },
        select: { sprint: { select: { id: true, sprintName: true, status: true } } },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    take: LIST_LIMITS.backlogItems,
  })
}

export function findBacklogItem(db: Db, projectId: string, itemId: string) {
  return db.productBacklogItem.findFirst({ where: { id: itemId, projectId }, include: LINKED_SELECT })
}

/** Next displayId and sortOrder (max + 1) for a new PBI. */
export async function nextBacklogNumbers(db: Db, projectId: string): Promise<{ displayId: number; sortOrder: number }> {
  const agg = await db.productBacklogItem.aggregate({
    where: { projectId },
    _max: { displayId: true, sortOrder: true },
  })
  return { displayId: (agg._max.displayId ?? 0) + 1, sortOrder: (agg._max.sortOrder ?? 0) + 1 }
}

export function insertBacklogItem(db: Db, data: Prisma.ProductBacklogItemUncheckedCreateInput) {
  return db.productBacklogItem.create({ data })
}

export function updateBacklogItem(
  db: Db,
  projectId: string,
  itemId: string,
  data: Prisma.ProductBacklogItemUncheckedUpdateInput
) {
  return db.productBacklogItem.update({ where: { id: itemId, projectId }, data })
}

/** Sprint tasks (incl. placeholders) that cascade with the PBI. */
export function findTasksOfBacklogItem(db: Db, itemId: string) {
  return db.sprintBacklogItem.findMany({ where: { pbItemId: itemId }, select: { id: true, sprintId: true } })
}

export function deleteBacklogItem(db: Db, projectId: string, itemId: string) {
  return db.productBacklogItem.delete({ where: { id: itemId, projectId } })
}

export function setBacklogSortOrder(db: Db, projectId: string, itemId: string, sortOrder: number) {
  return db.productBacklogItem.updateMany({ where: { id: itemId, projectId }, data: { sortOrder } })
}

/** Icebox request id if it exists inside the project, else null (cross-project guard). */
export function findProjectIceboxItemId(db: Db, projectId: string, iceboxItemId: string) {
  return db.iceboxItem.findFirst({ where: { id: iceboxItemId, projectId }, select: { id: true } })
}

/** Product goal id if it exists inside the project, else null (cross-project guard). */
export function findProjectGoalId(db: Db, projectId: string, productGoalId: string) {
  return db.productGoal.findFirst({ where: { id: productGoalId, projectId }, select: { id: true } })
}
