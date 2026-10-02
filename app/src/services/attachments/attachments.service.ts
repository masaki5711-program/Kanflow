import { copyTemplateFile, deleteUploadedFile, saveUploadedFile } from "@/lib/api-helpers"
import { logger } from "@/lib/logger"
import type { Actor } from "@/services/_shared/actor"
import { defaultDb, withTransaction } from "@/services/_shared/db"
import { NotFoundError, StatusError, ValidationError } from "@/services/_shared/errors"
import { wouldCreateCycle } from "@/services/_shared/tree"
import * as repo from "./attachments.repository"
import { LINK_MIME, isLinkEntry, normalizeLinkUrl, suggestLinkName } from "@/lib/attachment-links"
import { assertStorageQuota } from "./storage-quota"
import type { CreateFolderInput, CreateLinkInput, MoveAttachmentInput, UpdateFolderInput } from "./attachments.schemas"

const log = logger.child({ module: "attachments-service" })

const FOLDER_MISSING = "フォルダがありません"

interface AttachmentRow {
  id: string
  originalName: string
  fileName: string
  fileSize: number
  mimeType: string
  folderId: string | null
  createdAt: Date
  linkUrl?: string | null
}

/** The list-item shape the attachment UI consumes. */
export function toAttachmentDto(a: AttachmentRow) {
  return {
    id: a.id,
    originalName: a.originalName,
    fileName: a.fileName,
    fileSize: a.fileSize,
    mimeType: a.mimeType,
    folderId: a.folderId,
    createdAt: a.createdAt.toISOString(),
    linkUrl: a.linkUrl ?? null,
  }
}

const invalidLink = () => new ValidationError("http:// または https:// で始まる URL を入力してください", {}, "LINK_URL_INVALID")

/** A link entry (no file, nothing counted against the storage quota). */
export async function createLink(projectId: string, input: CreateLinkInput, actor: Actor) {
  const url = normalizeLinkUrl(input.url)
  if (!url) throw invalidLink()
  const folderId = input.folderId || null
  if (folderId) await assertFolderInProject(projectId, folderId)
  const name = input.name?.trim() || suggestLinkName(url)
  const row = await withTransaction(async (tx) => {
    const sortOrder = await repo.firstAttachmentSortOrder(tx, projectId, folderId)
    const created = await repo.insertAttachment(tx, {
      projectId,
      folderId,
      fileName: "",
      originalName: name,
      fileSize: 0,
      mimeType: LINK_MIME,
      uploadedBy: actor.userName,
      linkUrl: url,
    })
    return repo.updateAttachment(tx, projectId, created.id, { sortOrder })
  })
  return toAttachmentDto(row)
}

async function assertFolderInProject(projectId: string, folderId: string): Promise<void> {
  const folder = await repo.findFolderInProject(defaultDb, projectId, folderId)
  if (!folder) throw new NotFoundError(FOLDER_MISSING, {}, "FOLDER_NOT_FOUND")
}

export async function uploadAttachment(projectId: string, file: File | null, folderId: string | null, actor: Actor) {
  if (!file) throw new ValidationError("ファイルがありません", {}, "FILE_REQUIRED")
  if (folderId) await assertFolderInProject(projectId, folderId)
  await assertStorageQuota(projectId, file.size)
  const saved = await saveUploadedFile(projectId, file)
  if (!saved.ok) throw new StatusError(saved.status, saved.error, {}, saved.code)
  const attachment = await repo.insertAttachment(defaultDb, {
    projectId,
    folderId,
    fileName: saved.fileName,
    originalName: saved.originalName,
    fileSize: saved.fileSize,
    mimeType: saved.mimeType,
    uploadedBy: actor.userName,
  })
  return toAttachmentDto(attachment)
}

export interface ProjectTemplate {
  fileName: string
  displayName: string
  mimeType: string
}

/** Seed a template file as a root attachment. Best effort: logs and returns false on failure. */
export async function attachTemplate(projectId: string, template: ProjectTemplate, uploadedBy: string | null): Promise<boolean> {
  const copied = await copyTemplateFile(projectId, template.fileName, template.displayName, template.mimeType)
  if (!copied.ok) {
    log.warn("default template attach skipped", { projectId, reason: copied.error })
    return false
  }
  await repo.insertAttachment(defaultDb, {
    projectId,
    folderId: null,
    fileName: copied.fileName,
    originalName: copied.originalName,
    fileSize: copied.fileSize,
    mimeType: copied.mimeType,
    uploadedBy,
  })
  return true
}

export async function getAttachment(projectId: string, attachmentId: string) {
  const attachment = await repo.findAttachment(defaultDb, projectId, attachmentId)
  if (!attachment) throw new NotFoundError()
  return attachment
}

/** Move / reorder; for a link entry also rename or change the URL (files cannot be renamed here). */
export async function moveAttachment(projectId: string, attachmentId: string, input: MoveAttachmentInput) {
  if (input.folderId) await assertFolderInProject(projectId, input.folderId)
  const editsLink = input.name !== undefined || input.url !== undefined
  let linkUrl: string | undefined
  if (editsLink) {
    const current = await getAttachment(projectId, attachmentId)
    if (!isLinkEntry(current)) throw new ValidationError("ファイルの名前や URL はここでは変更できません", {}, "LINK_ONLY_FIELD")
    if (input.url !== undefined) {
      linkUrl = normalizeLinkUrl(input.url) ?? undefined
      if (!linkUrl) throw invalidLink()
    }
  }
  const row = await repo.updateAttachment(defaultDb, projectId, attachmentId, {
    ...(input.folderId !== undefined ? { folderId: input.folderId } : {}),
    ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    ...(input.name !== undefined ? { originalName: input.name } : {}),
    ...(linkUrl !== undefined ? { linkUrl } : {}),
  })
  return editsLink ? toAttachmentDto(row) : row
}

/** Deletes the row, then the stored file (a missing file is ignored). */
export async function deleteAttachment(projectId: string, attachmentId: string): Promise<void> {
  const attachment = await getAttachment(projectId, attachmentId)
  await repo.deleteAttachment(defaultDb, attachmentId)
  // A link entry has no stored file.
  if (!isLinkEntry(attachment) && attachment.fileName) await deleteUploadedFile(projectId, attachment.fileName)
}

export async function createFolder(projectId: string, input: CreateFolderInput) {
  const parentId = input.parentId ?? null
  if (parentId) await assertFolderInProject(projectId, parentId)
  const folder = await withTransaction(async (tx) => {
    const sortOrder = await repo.nextFolderSortOrder(tx, projectId, parentId)
    return repo.insertFolder(tx, { projectId, name: input.name, parentId, sortOrder })
  })
  return {
    id: folder.id,
    name: folder.name,
    parentId: folder.parentId,
    sortOrder: folder.sortOrder,
    attachments: folder.attachments.map(toAttachmentDto),
  }
}

/**
 * Rename / reorder / reparent. The new parent must be a folder of the same
 * project and must not be the folder itself or one of its descendants.
 */
export async function updateFolder(projectId: string, folderId: string, input: UpdateFolderInput) {
  if (input.parentId === folderId) throw new ValidationError("自分自身を親にはできません", {}, "FOLDER_SELF_PARENT")
  if (input.parentId) {
    const tree = await repo.findFolderTree(defaultDb, projectId)
    if (!tree.some((f) => f.id === input.parentId)) throw new NotFoundError(FOLDER_MISSING, {}, "FOLDER_NOT_FOUND")
    if (wouldCreateCycle(tree, folderId, input.parentId)) throw new ValidationError("循環参照になります", {}, "FOLDER_CYCLE")
  }
  return repo.updateFolder(defaultDb, projectId, folderId, input)
}

/** Direct attachments move to the root; sub-folders cascade (their files get folderId NULL). */
export async function deleteFolder(projectId: string, folderId: string): Promise<void> {
  await withTransaction(async (tx) => {
    await repo.detachFolderAttachments(tx, projectId, folderId)
    await repo.deleteFolder(tx, projectId, folderId)
  })
}
