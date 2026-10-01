import type { Db } from "@/services/_shared/db"

/** The PBI fields a dependency chip / list row shows. */
const REF_SELECT = { id: true, displayId: true, initiative: true, userStory: true, status: true } as const

/** Both ends live: a link to a trashed PBI is kept for a restore but never shown. */
const LIVE_ENDS = { predecessor: { deletedAt: null }, successor: { deletedAt: null } } as const

/**
 * Live-to-live dependencies of the project with both ends' display fields.
 * `itemId` narrows to the links touching that PBI (the detail view).
 */
export function findDependencyRows(db: Db, projectId: string, itemId?: string) {
  return db.backlogItemDependency.findMany({
    where: {
      projectId,
      ...LIVE_ENDS,
      ...(itemId && { OR: [{ predecessorId: itemId }, { successorId: itemId }] }),
    },
    select: {
      id: true,
      predecessorId: true,
      successorId: true,
      predecessor: { select: REF_SELECT },
      successor: { select: REF_SELECT },
    },
    orderBy: { createdAt: "asc" },
  })
}

export type DependencyRow = Awaited<ReturnType<typeof findDependencyRows>>[number]

/** Every edge of the project, trashed ends included (the cycle guard must see them all). */
export function findDependencyEdges(db: Db, projectId: string) {
  return db.backlogItemDependency.findMany({ where: { projectId }, select: { predecessorId: true, successorId: true } })
}

/** Ids among `ids` that are live PBIs of the project. */
export async function findLivePbiIds(db: Db, projectId: string, ids: readonly string[]): Promise<Set<string>> {
  const rows = await db.productBacklogItem.findMany({
    where: { projectId, deletedAt: null, id: { in: [...ids] } },
    select: { id: true },
  })
  return new Set(rows.map((r) => r.id))
}

export function insertDependency(db: Db, data: { projectId: string; predecessorId: string; successorId: string }) {
  return db.backlogItemDependency.create({ data, select: { id: true, predecessorId: true, successorId: true } })
}

export function findDependency(db: Db, projectId: string, id: string) {
  return db.backlogItemDependency.findFirst({ where: { id, projectId }, select: { id: true, predecessorId: true, successorId: true } })
}

export function deleteDependency(db: Db, id: string) {
  return db.backlogItemDependency.delete({ where: { id } })
}
