import type { Db } from "@/services/_shared/db"
import { notDeleted } from "@/services/_shared/soft-delete"
import { PBI_MAX_ATTACHMENTS } from "@/lib/pbi-attachments"

/** The DTO columns of an attachment (no backlogItemId: the URL already carries it). */
export const PBI_ATTACHMENT_SELECT = {
  id: true,
  fileName: true,
  originalName: true,
  fileSize: true,
  mimeType: true,
  createdAt: true,
} as const

/** A live PBI of the project (id only), or null when missing / trashed / another project's. */
export function findLiveBacklogItemId(db: Db, projectId: string, itemId: string) {
  return db.productBacklogItem.findFirst({ where: notDeleted({ id: itemId, projectId }), select: { id: true } })
}

export function findPbiAttachments(db: Db, itemId: string) {
  return db.pbiAttachment.findMany({
    where: { backlogItemId: itemId },
    select: PBI_ATTACHMENT_SELECT,
    orderBy: { createdAt: "asc" },
    take: PBI_MAX_ATTACHMENTS,
  })
}

export function countPbiAttachments(db: Db, itemId: string) {
  return db.pbiAttachment.count({ where: { backlogItemId: itemId } })
}

export function insertPbiAttachment(
  db: Db,
  data: { backlogItemId: string; fileName: string; originalName: string; fileSize: number; mimeType: string }
) {
  return db.pbiAttachment.create({ data, select: PBI_ATTACHMENT_SELECT })
}

/** One attachment of a live PBI of the project (scoped through the PBI), or null. */
export function findPbiAttachment(db: Db, projectId: string, itemId: string, attachmentId: string) {
  return db.pbiAttachment.findFirst({
    where: { id: attachmentId, backlogItemId: itemId, backlogItem: notDeleted({ projectId }) },
  })
}

export function deletePbiAttachment(db: Db, attachmentId: string) {
  return db.pbiAttachment.delete({ where: { id: attachmentId } })
}
