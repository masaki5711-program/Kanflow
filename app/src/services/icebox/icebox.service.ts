import { deleteUploadedFile, saveUploadedFile } from "@/lib/api-helpers"
import { assertStorageQuota } from "@/services/attachments/storage-quota"
import type { Actor } from "@/services/_shared/actor"
import { loadSnapshot, logActivity, logCreate, logUpdate } from "@/services/_shared/activity"
import { defaultDb, withTransaction } from "@/services/_shared/db"
import { NotFoundError, StatusError, ValidationError, rethrowPrisma } from "@/services/_shared/errors"
import { assertProjectLive } from "@/services/_shared/soft-delete"
import { DISPLAY_ID_CONFLICT, retryOnUniqueViolation } from "@/services/_shared/unique-retry"
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

/** displayId is max + 1 under a unique (projectId, displayId) index; P2002 = lost race, retried. */
export async function createIceboxItem(projectId: string, input: CreateIceboxItemInput, actor: Actor) {
  const data = await prepareText(input, actor.userId)
  return retryOnUniqueViolation(() => insertIceboxItemTx(projectId, data, actor)).catch((err: unknown) =>
    rethrowPrisma(err, { conflict: DISPLAY_ID_CONFLICT })
  )
}

function insertIceboxItemTx(projectId: string, data: CreateIceboxItemInput, actor: Actor) {
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
    await logCreate(tx, { projectId, entityType: "icebox", entityId: item.id, actor, row: item, meta: { displayId: item.displayId } })
    return item
  })
}

export async function updateIceboxItem(projectId: string, itemId: string, input: UpdateIceboxItemInput, actor: Actor) {
  const data = await prepareText(input, actor.userId)
  const item = await withTransaction(async (tx) => {
    const before = await loadSnapshot(tx, "icebox", itemId)
    const updated = await repo.updateIceboxItem(tx, projectId, itemId, data)
    await enqueueIn(tx, "icebox_item", updated.id, data)
    const meta = { displayId: updated.displayId }
    await logUpdate(tx, { projectId, entityType: "icebox", entityId: itemId, actor, before, after: updated, meta })
    return updated
  })
  return attachI18nOne("icebox_item", item)
}

/**
 * Moves the request to the trash (restorable until purged, see
 * purgeIceboxItem). Attachments (rows and files) and translations are kept;
 * PBIs made from it keep the link but no longer show the trashed request.
 */
export async function deleteIceboxItem(projectId: string, itemId: string, actor: Actor): Promise<void> {
  await withTransaction(async (tx) => {
    if (!(await repo.softDeleteIceboxItem(tx, projectId, itemId, actor.userId))) {
      throw new NotFoundError("Not found", {}, "ICEBOX_ITEM_NOT_FOUND")
    }
    await logActivity(tx, { projectId, entityType: "icebox", entityId: itemId, action: "delete", actor, diff: { meta: { trashed: true } } })
  })
}

/** Attachment add / remove is recorded as an "update" of the request (after the write, default client). */
function logAttachmentChange(projectId: string, itemId: string, change: { from: string | null; to: string | null }, actor: Actor | null) {
  return logActivity(defaultDb, {
    projectId,
    entityType: "icebox",
    entityId: itemId,
    action: "update",
    actor,
    diff: { changes: { attachment: change } },
  })
}

export async function uploadIceboxAttachment(projectId: string, itemId: string, file: File | null, actor: Actor | null = null) {
  const item = await repo.findIceboxItemId(defaultDb, projectId, itemId)
  if (!item) throw new NotFoundError()
  if (!file) throw new ValidationError("ファイルがありません", {}, "FILE_REQUIRED")
  await assertStorageQuota(projectId, file.size)
  const saved = await saveUploadedFile(projectId, file)
  if (!saved.ok) throw new StatusError(saved.status, saved.error, {}, saved.code)
  const attachment = await repo.insertIceboxAttachment(defaultDb, {
    iceboxItemId: itemId,
    fileName: saved.fileName,
    originalName: saved.originalName,
    fileSize: saved.fileSize,
    mimeType: saved.mimeType,
  })
  await logAttachmentChange(projectId, itemId, { from: null, to: saved.originalName }, actor)
  return attachment
}

export async function getIceboxAttachment(projectId: string, itemId: string, attachmentId: string) {
  const attachment = await repo.findIceboxAttachment(defaultDb, projectId, itemId, attachmentId)
  if (!attachment) throw new NotFoundError()
  return attachment
}

export async function deleteIceboxAttachment(
  projectId: string,
  itemId: string,
  attachmentId: string,
  actor: Actor | null = null
): Promise<void> {
  const attachment = await getIceboxAttachment(projectId, itemId, attachmentId)
  await repo.deleteIceboxAttachment(defaultDb, attachmentId)
  await logAttachmentChange(projectId, itemId, { from: attachment.originalName, to: null }, actor)
  await deleteUploadedFile(projectId, attachment.fileName)
}

// === trash: restore / purge ===

/** Takes a trashed request out of the trash. 404 when not trashed; 409 PROJECT_IN_TRASH while its project is trashed. */
export async function restoreIceboxItem(projectId: string, itemId: string, actor: Actor): Promise<void> {
  await withTransaction(async (tx) => {
    if (!(await repo.findTrashedIceboxItem(tx, projectId, itemId))) {
      throw new NotFoundError("Not found", {}, "ICEBOX_ITEM_NOT_FOUND")
    }
    await assertProjectLive(tx, projectId)
    await repo.restoreIceboxItemRow(tx, projectId, itemId)
    await logActivity(tx, { projectId, entityType: "icebox", entityId: itemId, action: "restore", actor })
  })
}

/**
 * Permanently deletes a trashed request with its translations (one
 * transaction); attachment rows cascade and their stored files are removed
 * after commit. PBIs made from it keep existing (iceboxItemId → NULL).
 * `actor` null = the purge-trash worker job.
 */
export async function purgeIceboxItem(projectId: string, itemId: string, actor: Actor | null): Promise<void> {
  const files = await withTransaction(async (tx) => {
    if (!(await repo.findTrashedIceboxItem(tx, projectId, itemId))) {
      throw new NotFoundError("Not found", {}, "ICEBOX_ITEM_NOT_FOUND")
    }
    const attachments = await repo.findAttachmentFileNames(tx, itemId)
    await repo.deleteIceboxItem(tx, projectId, itemId)
    await purgeIn(tx, { icebox_item: [itemId] })
    await logActivity(tx, { projectId, entityType: "icebox", entityId: itemId, action: "delete", actor, diff: { meta: { purged: true } } })
    return attachments.map((a) => a.fileName)
  })
  for (const fileName of files) await deleteUploadedFile(projectId, fileName)
}
