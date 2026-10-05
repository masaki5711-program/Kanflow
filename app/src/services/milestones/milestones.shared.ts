import { deleteUploadedFile, saveUploadedFile } from "@/lib/api-helpers"
import { assertStorageQuota } from "@/services/attachments/storage-quota"
import type { Actor } from "@/services/_shared/actor"
import { logActivity, type FieldChange } from "@/services/_shared/activity"
import type { Db } from "@/services/_shared/db"
import { NotFoundError, StatusError, ValidationError } from "@/services/_shared/errors"
import * as repo from "./milestones.repository"

/**
 * Pieces every board service shares: not-found / limit errors, the activity
 * row (entity "project": the board has no entity of its own in the feed),
 * date columns, the stage link check and the guarded file upload.
 */

export const notFound = () => new NotFoundError("Not found")

/** 400 MILESTONE_LIMIT_REACHED when `count` already reached `max`. */
export function assertRoom(count: number, max: number): void {
  if (count >= max) throw new ValidationError(`これ以上追加できません（上限 ${max} 件）`, { max }, "MILESTONE_LIMIT_REACHED")
}

/** One board change in the project's history; `key` names the part (milestoneCheck, punchItem …). */
export function logBoard(tx: Db, projectId: string, actor: Actor | null, key: string, change: FieldChange, meta?: Record<string, unknown>) {
  return logActivity(tx, { projectId, entityType: "project", entityId: projectId, action: "update", actor, diff: { changes: { [key]: change }, ...(meta && { meta }) } })
}

/** "YYYY-MM-DD" → UTC midnight; "" / null → null; undefined stays undefined (field untouched). */
export function dayColumn(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined
  return value ? new Date(`${value}T00:00:00.000Z`) : null
}

/** Today (UTC midnight of the Tokyo calendar day). */
export function todayUtc(now: Date): Date {
  const tokyo = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return new Date(Date.UTC(tokyo.getUTCFullYear(), tokyo.getUTCMonth(), tokyo.getUTCDate()))
}

/** A stage link must point at a live plan item of the project (null / undefined pass). */
export async function assertStageLink(db: Db, projectId: string, planItemId: string | null | undefined): Promise<void> {
  if (!planItemId) return
  if (!(await repo.findLivePlanItem(db, projectId, planItemId))) throw new ValidationError("工程が見つかりません", {}, "INVALID_REFERENCE")
}

/** Input without the keys whose value is undefined (Prisma "leave untouched"). */
export function defined<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) as Partial<T>
}

export interface StoredUpload {
  fileName: string
  originalName: string
  fileSize: number
  mimeType: string
}

/**
 * Save one uploaded file like the PBI 参考資料 / KAIZEN photos: quota first,
 * then saveUploadedFile (MIME allow-list, content sniffing, size cap). With
 * `imageOnly` the verified type must be an image (the stored file is removed otherwise).
 */
export async function storeUpload(projectId: string, file: File | null, opts: { imageOnly: boolean }): Promise<StoredUpload> {
  if (!file) throw new ValidationError("ファイルがありません", {}, "FILE_REQUIRED")
  const notImage = () => new ValidationError("画像ファイルを選んでください", {}, "IMPROVEMENT_PHOTO_NOT_IMAGE")
  if (opts.imageOnly && file.type && !file.type.startsWith("image/")) throw notImage()
  await assertStorageQuota(projectId, file.size)
  const saved = await saveUploadedFile(projectId, file)
  if (!saved.ok) throw new StatusError(saved.status, saved.error, {}, saved.code)
  if (opts.imageOnly && !saved.mimeType.startsWith("image/")) {
    await deleteUploadedFile(projectId, saved.fileName)
    throw notImage()
  }
  return { fileName: saved.fileName, originalName: saved.originalName, fileSize: saved.fileSize, mimeType: saved.mimeType }
}

/** Remove stored files after their rows are gone (best effort, like the KAIZEN photos). */
export async function removeStoredFiles(projectId: string, files: ReadonlyArray<{ fileName: string }>): Promise<void> {
  await Promise.all(files.map((f) => deleteUploadedFile(projectId, f.fileName)))
}
