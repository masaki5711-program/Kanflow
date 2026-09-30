import type { Prisma } from "@/generated/prisma/client"
import type { Db } from "@/services/_shared/db"
import { LIST_LIMITS } from "@/services/_shared/limits"
import { RESTORE_DATA, notDeleted, softDeleteData } from "@/services/_shared/soft-delete"
import { BUMP_VERSION, versionWhere } from "@/services/_shared/versioning"

export function findIceboxItems(db: Db, projectId: string) {
  return db.iceboxItem.findMany({
    where: notDeleted({ projectId }),
    include: { attachments: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    take: LIST_LIMITS.iceboxItems,
  })
}

/** Trashed items count: a displayId is never reused. */
export async function nextIceboxDisplayId(db: Db, projectId: string): Promise<number> {
  const agg = await db.iceboxItem.aggregate({ where: { projectId }, _max: { displayId: true } })
  return (agg._max.displayId ?? 0) + 1
}

export function insertIceboxItem(db: Db, data: Prisma.IceboxItemUncheckedCreateInput) {
  return db.iceboxItem.create({ data, include: { attachments: true } })
}

/**
 * Optimistic-lock update of a live item: matches `version` when given and
 * always bumps it. The updated row (with attachments), or null when nothing
 * matched (missing / trashed / stale — the service tells them apart).
 */
export async function updateIceboxItem(
  db: Db,
  projectId: string,
  itemId: string,
  data: Prisma.IceboxItemUncheckedUpdateInput,
  version?: number
) {
  const res = await db.iceboxItem.updateMany({
    where: notDeleted({ id: itemId, projectId, ...versionWhere(version) }),
    data: { ...data, ...BUMP_VERSION },
  })
  if (res.count === 0) return null
  return db.iceboxItem.findFirst({ where: { id: itemId, projectId }, include: { attachments: true } })
}

/** A live item of the project with its attachments (the list DTO shape). */
export function findIceboxItem(db: Db, projectId: string, itemId: string) {
  return db.iceboxItem.findFirst({ where: notDeleted({ id: itemId, projectId }), include: { attachments: true } })
}

/** Stored file names of the item's attachments (the rows cascade on delete). */
export function findAttachmentFileNames(db: Db, itemId: string) {
  return db.iceboxAttachment.findMany({ where: { iceboxItemId: itemId }, select: { fileName: true } })
}

/** Hard delete (purge). Normal deletes go to the trash via softDeleteIceboxItem. */
export function deleteIceboxItem(db: Db, projectId: string, itemId: string) {
  return db.iceboxItem.delete({ where: { id: itemId, projectId } })
}

export function findIceboxItemId(db: Db, projectId: string, itemId: string) {
  return db.iceboxItem.findFirst({ where: notDeleted({ id: itemId, projectId }), select: { id: true } })
}

export function insertIceboxAttachment(
  db: Db,
  data: { iceboxItemId: string; fileName: string; originalName: string; fileSize: number; mimeType: string }
) {
  return db.iceboxAttachment.create({ data })
}

export function findIceboxAttachment(db: Db, projectId: string, itemId: string, attachmentId: string) {
  return db.iceboxAttachment.findFirst({
    where: { id: attachmentId, iceboxItemId: itemId, iceboxItem: notDeleted({ projectId }) },
  })
}

export function deleteIceboxAttachment(db: Db, attachmentId: string) {
  return db.iceboxAttachment.delete({ where: { id: attachmentId } })
}

// === trash ===

const TRASHED = { deletedAt: { not: null } } as const

/** Move a live Icebox item of the project (at `version`, when given) to the trash. False when no live row matched. */
export async function softDeleteIceboxItem(
  db: Db,
  projectId: string,
  itemId: string,
  actorUserId: string,
  version?: number,
  now: Date = new Date()
): Promise<boolean> {
  const res = await db.iceboxItem.updateMany({
    where: notDeleted({ id: itemId, projectId, ...versionWhere(version) }),
    data: softDeleteData(actorUserId, now),
  })
  return res.count > 0
}

/** Take a trashed Icebox item of the project out of the trash. False when no trashed row matched. */
export async function restoreIceboxItemRow(db: Db, projectId: string, itemId: string): Promise<boolean> {
  const res = await db.iceboxItem.updateMany({ where: { id: itemId, projectId, ...TRASHED }, data: RESTORE_DATA })
  return res.count > 0
}

export function findTrashedIceboxItem(db: Db, projectId: string, itemId: string) {
  return db.iceboxItem.findFirst({ where: { id: itemId, projectId, ...TRASHED }, select: { id: true, projectId: true } })
}

/** The project's trashed Icebox items, newest deletion first. */
export function findTrashedIceboxItems(db: Db, projectId: string) {
  return db.iceboxItem.findMany({
    where: { projectId, ...TRASHED },
    select: { id: true, displayId: true, request: true, status: true, deletedAt: true, deletedById: true },
    orderBy: { deletedAt: "desc" },
    take: LIST_LIMITS.iceboxItems,
  })
}

/** Trashed Icebox items (any project) whose retention ended; oldest first, bounded batch. */
export function findExpiredTrashedIceboxItems(db: Db, cutoff: Date, take: number) {
  return db.iceboxItem.findMany({
    where: { deletedAt: { lt: cutoff } },
    select: { id: true, projectId: true },
    orderBy: { deletedAt: "asc" },
    take,
  })
}
