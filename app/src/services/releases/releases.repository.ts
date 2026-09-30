import type { Prisma } from "@/generated/prisma/client"
import type { Db } from "@/services/_shared/db"
import { LIST_LIMITS } from "@/services/_shared/limits"

export function findReleaseItems(db: Db, projectId: string) {
  return db.releaseBacklogItem.findMany({
    where: { projectId },
    include: {
      pbItem: {
        select: { id: true, displayId: true, userStory: true, epic: true, initiative: true, workloadScore: true },
      },
    },
    orderBy: [{ planVersion: "asc" }, { createdAt: "asc" }],
    take: LIST_LIMITS.releaseItems,
  })
}

export function updateReleaseItem(db: Db, projectId: string, id: string, data: Prisma.ReleaseBacklogItemUncheckedUpdateInput) {
  return db.releaseBacklogItem.update({ where: { id, projectId }, data })
}

export function deleteReleaseItem(db: Db, projectId: string, id: string) {
  return db.releaseBacklogItem.delete({ where: { id, projectId } })
}

/** The PBI fields copied into a release item. */
export function findPbisForRelease(db: Db, projectId: string, pbItemIds: readonly string[]) {
  return db.productBacklogItem.findMany({
    where: { id: { in: [...pbItemIds] }, projectId },
    select: { id: true, initiative: true, epic: true, userStory: true, assignedPo: true, poNote: true },
  })
}

export function insertReleaseItem(db: Db, data: Prisma.ReleaseBacklogItemUncheckedCreateInput) {
  return db.releaseBacklogItem.create({ data })
}
