/**
 * Soft delete (trash) for ProductBacklogItem, IceboxItem and Project.
 *
 * A trashed row keeps everything (translations, attachments on disk, sprint
 * tasks, displayId) and only gets `deletedAt` / `deletedById`. Every read path
 * adds the live filter explicitly — there is deliberately NO Prisma `$extends`
 * auto-filter: the trash views, restore, purge and displayId numbering must
 * see trashed rows, and an implicit filter would hide that from the reader.
 *
 *   db.productBacklogItem.findMany({ where: notDeleted({ projectId }) })
 *   db.sprintBacklogItem.findMany({ where: { sprintId, ...LIVE_PBI } })
 *
 * The worker job (src/worker/jobs/purge-trash.ts) hard-deletes rows that sat
 * in the trash longer than PURGE_TRASH_AFTER_DAYS.
 */
import type { Db } from "./db"
import type { ApiErrorCode } from "./error-codes"
import { ConflictError, NotFoundError } from "./errors"

/** Where-fragment: the row itself is not in the trash. */
export const NOT_DELETED = Object.freeze({ deletedAt: null })

/** Sprint task / release item filter: the parent PBI is not in the trash. */
export const LIVE_PBI = Object.freeze({ pbItem: NOT_DELETED })

/** Child-of-project filter: the owning project is not in the trash. */
export const LIVE_PROJECT = Object.freeze({ project: NOT_DELETED })

/** `where` plus the live filter (new object; the input is not changed). */
export function notDeleted<W extends object>(where: W): W & { deletedAt: null } {
  return { ...where, deletedAt: null }
}

export interface SoftDeletable {
  deletedAt: Date | null
}

export function isDeleted(row: SoftDeletable | null | undefined): boolean {
  return !!row && row.deletedAt !== null
}

/**
 * 404 unless `row` exists and is live. For reads that load a row first and
 * must treat a trashed row exactly like a missing one.
 */
export function assertNotDeleted<T extends SoftDeletable>(
  row: T | null | undefined,
  message = "Not found",
  code?: ApiErrorCode
): asserts row is T {
  if (!row || row.deletedAt !== null) throw new NotFoundError(message, {}, code)
}

/** Update payload that moves a row to the trash. */
export function softDeleteData(actorUserId: string, now: Date = new Date()) {
  return { deletedAt: now, deletedById: actorUserId }
}

/** Update payload that takes a row out of the trash. */
export const RESTORE_DATA = Object.freeze({ deletedAt: null, deletedById: null })

export const DEFAULT_PURGE_TRASH_AFTER_DAYS = 30

/** PURGE_TRASH_AFTER_DAYS: positive integer, default 30. */
export function resolvePurgeTrashAfterDays(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_PURGE_TRASH_AFTER_DAYS
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_PURGE_TRASH_AFTER_DAYS
}

const DAY_MS = 86_400_000

/** Rows trashed before this instant are due for purge. */
export function purgeCutoff(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS)
}

/**
 * A to-one relation cannot be filtered in a Prisma include, so a linked row
 * (e.g. the Icebox request of a PBI) is loaded with `deletedAt` and hidden here.
 */
export function hideTrashed<T extends SoftDeletable>(row: T | null | undefined): T | null {
  return row && row.deletedAt === null ? row : null
}

/**
 * Restoring a PBI / Icebox item needs its project out of the trash first:
 * 409 PROJECT_IN_TRASH (404 when the project does not exist).
 */
export async function assertProjectLive(db: Db, projectId: string): Promise<void> {
  const project = await db.project.findUnique({ where: { id: projectId }, select: { deletedAt: true } })
  if (!project) throw new NotFoundError()
  if (project.deletedAt !== null) {
    throw new ConflictError("Project is in the trash; restore the project first", {}, "PROJECT_IN_TRASH")
  }
}
