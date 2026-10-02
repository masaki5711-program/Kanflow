import type { Prisma } from "@/generated/prisma/client"
import type { Db } from "@/services/_shared/db"
import { LIST_LIMITS } from "@/services/_shared/limits"
import { RESTORE_DATA, notDeleted, softDeleteData } from "@/services/_shared/soft-delete"
import { BUMP_VERSION, versionWhere } from "@/services/_shared/versioning"
import { PBI_MAX_ATTACHMENTS } from "@/lib/pbi-attachments"
import { PBI_ATTACHMENT_SELECT } from "./backlog.attachments.repository"
import type { PbiStatus } from "./backlog.schemas"

const LINKED_SELECT = {
  // deletedAt: a to-one include cannot be filtered, so the service hides a trashed request.
  iceboxItem: { select: { id: true, displayId: true, request: true, deletedAt: true } },
  productGoal: { select: { id: true, title: true } },
  // deletedAt: a trashed plan item is not shown as the PBI's plan item.
  planItem: { select: { id: true, name: true, deletedAt: true } },
} as const

/** `status` / `planItemId` narrow the list server-side (e.g. sprint planning only needs "ready"). */
export function findBacklogItems(db: Db, projectId: string, status?: PbiStatus, planItemId?: string) {
  return db.productBacklogItem.findMany({
    where: notDeleted({ projectId, ...(status && { status }), ...(planItemId && { planItemId }) }),
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

/** A live PBI with its links and 参考資料 attachments (the detail DTO shape). */
export function findBacklogItem(db: Db, projectId: string, itemId: string) {
  return db.productBacklogItem.findFirst({
    where: notDeleted({ id: itemId, projectId }),
    include: {
      ...LINKED_SELECT,
      attachments: { select: PBI_ATTACHMENT_SELECT, orderBy: { createdAt: "asc" }, take: PBI_MAX_ATTACHMENTS },
    },
  })
}

/** Next displayId and sortOrder (max + 1) for a new PBI. Trashed PBIs count: a displayId is never reused. */
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

/**
 * Optimistic-lock update of a live PBI: matches `version` when given and
 * always bumps it. Returns the updated row, or null when nothing matched
 * (missing / trashed / stale version — the service tells them apart).
 */
export async function updateBacklogItem(
  db: Db,
  projectId: string,
  itemId: string,
  data: Prisma.ProductBacklogItemUncheckedUpdateInput,
  version?: number
) {
  const res = await db.productBacklogItem.updateMany({
    where: notDeleted({ id: itemId, projectId, ...versionWhere(version) }),
    data: { ...data, ...BUMP_VERSION },
  })
  if (res.count === 0) return null
  return db.productBacklogItem.findFirst({ where: { id: itemId, projectId } })
}

// === bulk ===

/** Live PBIs of the project among `ids` (full rows: the "before" of a bulk diff). */
export function findLiveBacklogItemsByIds(db: Db, projectId: string, ids: readonly string[]) {
  return db.productBacklogItem.findMany({ where: notDeleted({ projectId, id: { in: [...ids] } }) })
}

/** One UPDATE for many live PBIs of the project (bumps every version). Returns the row count. */
export async function updateBacklogItemsMany(
  db: Db,
  projectId: string,
  ids: readonly string[],
  data: Prisma.ProductBacklogItemUncheckedUpdateManyInput
): Promise<number> {
  const res = await db.productBacklogItem.updateMany({
    where: notDeleted({ projectId, id: { in: [...ids] } }),
    data: { ...data, ...BUMP_VERSION },
  })
  return res.count
}

/** Move many live PBIs of the project to the trash in one UPDATE. Returns the row count. */
export async function softDeleteBacklogItemsMany(
  db: Db,
  projectId: string,
  ids: readonly string[],
  actorUserId: string,
  now: Date = new Date()
): Promise<number> {
  const res = await db.productBacklogItem.updateMany({
    where: notDeleted({ projectId, id: { in: [...ids] } }),
    data: softDeleteData(actorUserId, now),
  })
  return res.count
}

/** Sprint tasks (incl. placeholders) of several PBIs. */
export function findTasksOfBacklogItems(db: Db, itemIds: readonly string[]) {
  return db.sprintBacklogItem.findMany({ where: { pbItemId: { in: [...itemIds] } }, select: { id: true, sprintId: true } })
}

/** Sprint tasks (incl. placeholders) that cascade with the PBI. */
export function findTasksOfBacklogItem(db: Db, itemId: string) {
  return db.sprintBacklogItem.findMany({ where: { pbItemId: itemId }, select: { id: true, sprintId: true } })
}

/** The plan item a PBI of the project is linked to (trashed PBIs included), or null. */
export async function findPbiPlanItemId(db: Db, projectId: string, itemId: string): Promise<string | null> {
  const row = await db.productBacklogItem.findFirst({ where: { id: itemId, projectId }, select: { planItemId: true } })
  return row?.planItemId ?? null
}

/** Stored file names of the PBI's 参考資料 attachments (the rows cascade when the PBI is purged). */
export function findPbiAttachmentFileNames(db: Db, itemId: string) {
  return db.pbiAttachment.findMany({ where: { backlogItemId: itemId }, select: { fileName: true } })
}

/** Hard delete (purge). Normal deletes go to the trash via softDeleteBacklogItem. */
export function deleteBacklogItem(db: Db, projectId: string, itemId: string) {
  return db.productBacklogItem.delete({ where: { id: itemId, projectId } })
}

export function setBacklogSortOrder(db: Db, projectId: string, itemId: string, sortOrder: number) {
  return db.productBacklogItem.updateMany({ where: notDeleted({ id: itemId, projectId }), data: { sortOrder } })
}

/** Icebox request id if it exists inside the project, else null (cross-project guard). */
export function findProjectIceboxItemId(db: Db, projectId: string, iceboxItemId: string) {
  return db.iceboxItem.findFirst({ where: notDeleted({ id: iceboxItemId, projectId }), select: { id: true } })
}

/** Product goal id if it exists inside the project, else null (cross-project guard). */
export function findProjectGoalId(db: Db, projectId: string, productGoalId: string) {
  return db.productGoal.findFirst({ where: { id: productGoalId, projectId }, select: { id: true } })
}

// === trash ===

const TRASHED = { deletedAt: { not: null } } as const

/** Move a live PBI of the project (at `version`, when given) to the trash. False when no live row matched. */
export async function softDeleteBacklogItem(
  db: Db,
  projectId: string,
  itemId: string,
  actorUserId: string,
  version?: number,
  now: Date = new Date()
): Promise<boolean> {
  const res = await db.productBacklogItem.updateMany({
    where: notDeleted({ id: itemId, projectId, ...versionWhere(version) }),
    data: softDeleteData(actorUserId, now),
  })
  return res.count > 0
}

/** Take a trashed PBI of the project out of the trash. False when no trashed row matched. */
export async function restoreBacklogItemRow(db: Db, projectId: string, itemId: string): Promise<boolean> {
  const res = await db.productBacklogItem.updateMany({
    where: { id: itemId, projectId, ...TRASHED },
    data: RESTORE_DATA,
  })
  return res.count > 0
}

export function findTrashedBacklogItem(db: Db, projectId: string, itemId: string) {
  return db.productBacklogItem.findFirst({
    where: { id: itemId, projectId, ...TRASHED },
    select: { id: true, projectId: true },
  })
}

/** The project's trashed PBIs, newest deletion first. */
export function findTrashedBacklogItems(db: Db, projectId: string) {
  return db.productBacklogItem.findMany({
    where: { projectId, ...TRASHED },
    select: {
      id: true,
      displayId: true,
      initiative: true,
      userStory: true,
      status: true,
      deletedAt: true,
      deletedById: true,
    },
    orderBy: { deletedAt: "desc" },
    take: LIST_LIMITS.backlogItems,
  })
}

/** Trashed PBIs (any project) whose retention ended; oldest first, bounded batch. */
export function findExpiredTrashedBacklogItems(db: Db, cutoff: Date, take: number) {
  return db.productBacklogItem.findMany({
    where: { deletedAt: { lt: cutoff } },
    select: { id: true, projectId: true },
    orderBy: { deletedAt: "asc" },
    take,
  })
}
