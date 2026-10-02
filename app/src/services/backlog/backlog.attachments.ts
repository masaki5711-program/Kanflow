import { deleteUploadedFile, saveUploadedFile } from "@/lib/api-helpers"
import { PBI_MAX_ATTACHMENTS } from "@/lib/pbi-attachments"
import { assertStorageQuota } from "@/services/attachments/storage-quota"
import type { Actor } from "@/services/_shared/actor"
import { logActivity } from "@/services/_shared/activity"
import { defaultDb } from "@/services/_shared/db"
import { NotFoundError, StatusError, ValidationError } from "@/services/_shared/errors"
import * as repo from "./backlog.attachments.repository"

/**
 * Files / images of a PBI's 参考資料 (reference material). Same rules as the
 * IceBox attachments: stored under private/uploads/<projectId>, MIME / content
 * checked and size-capped by saveUploadedFile, counted in the project quota.
 * Add / remove do not bump the PBI version (no conflict with an open edit).
 */

const pbiNotFound = () => new NotFoundError("Not found", {}, "PBI_NOT_FOUND")

async function assertLivePbi(projectId: string, itemId: string): Promise<void> {
  if (!(await repo.findLiveBacklogItemId(defaultDb, projectId, itemId))) throw pbiNotFound()
}

/** Attachment add / remove is recorded as an "update" of the PBI (after the write, default client). */
function logAttachmentChange(projectId: string, itemId: string, change: { from: string | null; to: string | null }, actor: Actor | null) {
  return logActivity(defaultDb, {
    projectId,
    entityType: "pbi",
    entityId: itemId,
    action: "update",
    actor,
    diff: { changes: { attachment: change } },
  })
}

export async function listPbiAttachments(projectId: string, itemId: string) {
  await assertLivePbi(projectId, itemId)
  return repo.findPbiAttachments(defaultDb, itemId)
}

export async function uploadPbiAttachment(projectId: string, itemId: string, file: File | null, actor: Actor | null = null) {
  await assertLivePbi(projectId, itemId)
  if (!file) throw new ValidationError("ファイルがありません", {}, "FILE_REQUIRED")
  // Same per-PBI cap the UI shows (the UI check alone can be bypassed).
  if ((await repo.countPbiAttachments(defaultDb, itemId)) >= PBI_MAX_ATTACHMENTS) {
    throw new ValidationError(`添付は 1 件につき ${PBI_MAX_ATTACHMENTS} 個までです`, {}, "PBI_TOO_MANY_ATTACHMENTS")
  }
  await assertStorageQuota(projectId, file.size)
  const saved = await saveUploadedFile(projectId, file)
  if (!saved.ok) throw new StatusError(saved.status, saved.error, {}, saved.code)
  const attachment = await repo.insertPbiAttachment(defaultDb, {
    backlogItemId: itemId,
    fileName: saved.fileName,
    originalName: saved.originalName,
    fileSize: saved.fileSize,
    mimeType: saved.mimeType,
  })
  await logAttachmentChange(projectId, itemId, { from: null, to: saved.originalName }, actor)
  return attachment
}

export async function getPbiAttachment(projectId: string, itemId: string, attachmentId: string) {
  const attachment = await repo.findPbiAttachment(defaultDb, projectId, itemId, attachmentId)
  if (!attachment) throw new NotFoundError()
  return attachment
}

export async function deletePbiAttachment(projectId: string, itemId: string, attachmentId: string, actor: Actor | null = null): Promise<void> {
  const attachment = await getPbiAttachment(projectId, itemId, attachmentId)
  await repo.deletePbiAttachment(defaultDb, attachmentId)
  await logAttachmentChange(projectId, itemId, { from: attachment.originalName, to: null }, actor)
  await deleteUploadedFile(projectId, attachment.fileName)
}
