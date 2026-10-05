import { deleteUploadedFile, saveUploadedFile } from "@/lib/api-helpers"
import { IMPROVEMENT_MAX_PHOTOS_PER_PHASE, type PhotoPhase } from "@/lib/improvement/constants"
import { assertStorageQuota } from "@/services/attachments/storage-quota"
import type { Actor } from "@/services/_shared/actor"
import { logActivity } from "@/services/_shared/activity"
import { defaultDb } from "@/services/_shared/db"
import { NotFoundError, StatusError, ValidationError } from "@/services/_shared/errors"
import * as children from "./improvements.children.repository"
import * as repo from "./improvements.repository"

/**
 * Before / after photos of an improvement. Same storage and checks as the
 * PBI 参考資料 attachments (private/uploads/<projectId>, MIME / content
 * verified and size-capped by saveUploadedFile, counted in the project
 * quota), plus: images only, at most IMPROVEMENT_MAX_PHOTOS_PER_PHASE per phase.
 */

const notFound = () => new NotFoundError("Not found")

async function assertItem(projectId: string, itemId: string): Promise<void> {
  if (!(await repo.findItemState(defaultDb, projectId, itemId))) throw notFound()
}

function logPhotoChange(projectId: string, itemId: string, change: { from: string | null; to: string | null }, actor: Actor | null) {
  return logActivity(defaultDb, { projectId, entityType: "release", entityId: itemId, action: "update", actor, diff: { changes: { photo: change } } })
}

export async function listPhotos(projectId: string, itemId: string) {
  await assertItem(projectId, itemId)
  return children.findPhotos(defaultDb, itemId)
}

export async function uploadPhoto(projectId: string, itemId: string, phase: PhotoPhase, file: File | null, actor: Actor | null = null) {
  await assertItem(projectId, itemId)
  if (!file) throw new ValidationError("ファイルがありません", {}, "FILE_REQUIRED")
  if (file.type && !file.type.startsWith("image/")) throw new ValidationError("画像ファイルを選んでください", {}, "IMPROVEMENT_PHOTO_NOT_IMAGE")
  if ((await children.countPhotos(defaultDb, itemId, phase)) >= IMPROVEMENT_MAX_PHOTOS_PER_PHASE) {
    throw new ValidationError(`写真は ${IMPROVEMENT_MAX_PHOTOS_PER_PHASE} 枚までです`, {}, "IMPROVEMENT_TOO_MANY_PHOTOS")
  }
  await assertStorageQuota(projectId, file.size)
  const saved = await saveUploadedFile(projectId, file)
  if (!saved.ok) throw new StatusError(saved.status, saved.error, {}, saved.code)
  // The declared type can lie; the verified content type decides.
  if (!saved.mimeType.startsWith("image/")) {
    await deleteUploadedFile(projectId, saved.fileName)
    throw new ValidationError("画像ファイルを選んでください", {}, "IMPROVEMENT_PHOTO_NOT_IMAGE")
  }
  const photo = await children.insertPhoto(defaultDb, {
    releaseItemId: itemId,
    phase,
    fileName: saved.fileName,
    originalName: saved.originalName,
    fileSize: saved.fileSize,
    mimeType: saved.mimeType,
  })
  await logPhotoChange(projectId, itemId, { from: null, to: `${phase}: ${saved.originalName}` }, actor)
  return photo
}

export async function getPhoto(projectId: string, itemId: string, photoId: string) {
  const photo = await children.findPhoto(defaultDb, projectId, itemId, photoId)
  if (!photo) throw notFound()
  return photo
}

export async function deletePhoto(projectId: string, itemId: string, photoId: string, actor: Actor | null = null): Promise<void> {
  const photo = await getPhoto(projectId, itemId, photoId)
  await children.deletePhoto(defaultDb, photoId)
  await logPhotoChange(projectId, itemId, { from: `${photo.phase}: ${photo.originalName}`, to: null }, actor)
  await deleteUploadedFile(projectId, photo.fileName)
}
