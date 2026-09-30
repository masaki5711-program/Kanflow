import type { Prisma } from "@/generated/prisma/client"
import type { Db } from "@/services/_shared/db"
import { LIST_LIMITS } from "@/services/_shared/limits"

export function findIceboxItems(db: Db, projectId: string) {
  return db.iceboxItem.findMany({
    where: { projectId },
    include: { attachments: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    take: LIST_LIMITS.iceboxItems,
  })
}

export async function nextIceboxDisplayId(db: Db, projectId: string): Promise<number> {
  const agg = await db.iceboxItem.aggregate({ where: { projectId }, _max: { displayId: true } })
  return (agg._max.displayId ?? 0) + 1
}

export function insertIceboxItem(db: Db, data: Prisma.IceboxItemUncheckedCreateInput) {
  return db.iceboxItem.create({ data, include: { attachments: true } })
}

export function updateIceboxItem(db: Db, projectId: string, itemId: string, data: Prisma.IceboxItemUncheckedUpdateInput) {
  return db.iceboxItem.update({ where: { id: itemId, projectId }, data, include: { attachments: true } })
}

/** Stored file names of the item's attachments (the rows cascade on delete). */
export function findAttachmentFileNames(db: Db, itemId: string) {
  return db.iceboxAttachment.findMany({ where: { iceboxItemId: itemId }, select: { fileName: true } })
}

export function deleteIceboxItem(db: Db, projectId: string, itemId: string) {
  return db.iceboxItem.delete({ where: { id: itemId, projectId } })
}

export function findIceboxItemId(db: Db, projectId: string, itemId: string) {
  return db.iceboxItem.findFirst({ where: { id: itemId, projectId }, select: { id: true } })
}

export function insertIceboxAttachment(
  db: Db,
  data: { iceboxItemId: string; fileName: string; originalName: string; fileSize: number; mimeType: string }
) {
  return db.iceboxAttachment.create({ data })
}

export function findIceboxAttachment(db: Db, projectId: string, itemId: string, attachmentId: string) {
  return db.iceboxAttachment.findFirst({
    where: { id: attachmentId, iceboxItemId: itemId, iceboxItem: { projectId } },
  })
}

export function deleteIceboxAttachment(db: Db, attachmentId: string) {
  return db.iceboxAttachment.delete({ where: { id: attachmentId } })
}
