import { deleteUploadedFile, saveUploadedFile } from "@/lib/api-helpers"
import type { Actor } from "@/services/_shared/actor"
import { defaultDb, withTransaction } from "@/services/_shared/db"
import { NotFoundError, StatusError, ValidationError } from "@/services/_shared/errors"
import { attachI18n, attachI18nOne, enqueueIn, prepareText, purgeIn } from "@/services/_shared/translations"
import * as repo from "./icebox.repository"
import type { CreateIceboxItemInput, UpdateIceboxItemInput } from "./icebox.schemas"

export async function listIcebox(projectId: string) {
  const items = await attachI18n("icebox_item", await repo.findIceboxItems(defaultDb, projectId))
  return {
    unreviewed: items.filter((i) => i.status === "unreviewed"),
    reviewed: items.filter((i) => i.status === "reviewed"),
    completed: items.filter((i) => i.status === "completed"),
    frozen: items.filter((i) => i.status === "frozen"),
  }
}

export async function createIceboxItem(projectId: string, input: CreateIceboxItemInput, actor: Actor) {
  const data = await prepareText(input, actor.userId)
  return withTransaction(async (tx) => {
    const item = await repo.insertIceboxItem(tx, {
      projectId,
      displayId: await repo.nextIceboxDisplayId(tx, projectId),
      author: data.author ?? actor.userName ?? "",
      request: data.request,
      background: data.background,
      assignedPo: data.assignedPo,
      status: "unreviewed",
    })
    await enqueueIn(tx, "icebox_item", item.id, item)
    return item
  })
}

export async function updateIceboxItem(projectId: string, itemId: string, input: UpdateIceboxItemInput, actor: Actor) {
  const data = await prepareText(input, actor.userId)
  const item = await withTransaction(async (tx) => {
    const updated = await repo.updateIceboxItem(tx, projectId, itemId, data)
    await enqueueIn(tx, "icebox_item", updated.id, data)
    return updated
  })
  return attachI18nOne("icebox_item", item)
}

/**
 * Deletes the request with its translations (one transaction); attachment
 * rows cascade and their stored files are removed after commit. PBIs made
 * from the request keep existing (iceboxItemId → NULL).
 */
export async function deleteIceboxItem(projectId: string, itemId: string): Promise<void> {
  const files = await withTransaction(async (tx) => {
    const attachments = await repo.findAttachmentFileNames(tx, itemId)
    await repo.deleteIceboxItem(tx, projectId, itemId)
    await purgeIn(tx, { icebox_item: [itemId] })
    return attachments.map((a) => a.fileName)
  })
  for (const fileName of files) await deleteUploadedFile(projectId, fileName)
}

export async function uploadIceboxAttachment(projectId: string, itemId: string, file: File | null) {
  const item = await repo.findIceboxItemId(defaultDb, projectId, itemId)
  if (!item) throw new NotFoundError()
  if (!file) throw new ValidationError("ファイルがありません", {}, "FILE_REQUIRED")
  const saved = await saveUploadedFile(projectId, file)
  if (!saved.ok) throw new StatusError(saved.status, saved.error, {}, saved.code)
  return repo.insertIceboxAttachment(defaultDb, {
    iceboxItemId: itemId,
    fileName: saved.fileName,
    originalName: saved.originalName,
    fileSize: saved.fileSize,
    mimeType: saved.mimeType,
  })
}

export async function getIceboxAttachment(projectId: string, itemId: string, attachmentId: string) {
  const attachment = await repo.findIceboxAttachment(defaultDb, projectId, itemId, attachmentId)
  if (!attachment) throw new NotFoundError()
  return attachment
}

export async function deleteIceboxAttachment(projectId: string, itemId: string, attachmentId: string): Promise<void> {
  const attachment = await getIceboxAttachment(projectId, itemId, attachmentId)
  await repo.deleteIceboxAttachment(defaultDb, attachmentId)
  await deleteUploadedFile(projectId, attachment.fileName)
}
