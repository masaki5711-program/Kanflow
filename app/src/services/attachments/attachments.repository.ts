import type { Db } from "@/services/_shared/db"
import type { UpdateFolderInput } from "./attachments.schemas"

export interface NewAttachment {
  projectId: string
  folderId: string | null
  fileName: string
  originalName: string
  fileSize: number
  mimeType: string
  uploadedBy: string | null
}

export function findFolderInProject(db: Db, projectId: string, folderId: string) {
  return db.attachmentFolder.findFirst({ where: { id: folderId, projectId }, select: { id: true } })
}

export function insertAttachment(db: Db, data: NewAttachment) {
  return db.projectAttachment.create({ data })
}

export function findAttachment(db: Db, projectId: string, attachmentId: string) {
  return db.projectAttachment.findFirst({ where: { id: attachmentId, projectId } })
}

export function updateAttachment(
  db: Db,
  projectId: string,
  attachmentId: string,
  data: { folderId?: string | null; sortOrder?: number }
) {
  return db.projectAttachment.update({ where: { id: attachmentId, projectId }, data })
}

export function deleteAttachment(db: Db, attachmentId: string) {
  return db.projectAttachment.delete({ where: { id: attachmentId } })
}

export async function nextFolderSortOrder(db: Db, projectId: string, parentId: string | null): Promise<number> {
  const max = await db.attachmentFolder.aggregate({
    where: { projectId, parentId },
    _max: { sortOrder: true },
  })
  return (max._max.sortOrder ?? 0) + 1
}

export function insertFolder(db: Db, data: { projectId: string; name: string; parentId: string | null; sortOrder: number }) {
  return db.attachmentFolder.create({ data, include: { attachments: true } })
}

/** id / parentId of every folder in the project (for in-memory cycle checks). */
export function findFolderTree(db: Db, projectId: string) {
  return db.attachmentFolder.findMany({ where: { projectId }, select: { id: true, parentId: true } })
}

export function updateFolder(db: Db, projectId: string, folderId: string, data: UpdateFolderInput) {
  return db.attachmentFolder.update({ where: { id: folderId, projectId }, data })
}

/** Move the folder's own attachments to the root (files are kept). */
export function detachFolderAttachments(db: Db, projectId: string, folderId: string) {
  return db.projectAttachment.updateMany({ where: { folderId, projectId }, data: { folderId: null } })
}

export function deleteFolder(db: Db, projectId: string, folderId: string) {
  return db.attachmentFolder.delete({ where: { id: folderId, projectId } })
}
