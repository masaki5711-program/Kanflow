/**
 * Retention sweep for the collaboration tables (worker job, daily):
 * - ActivityLog rows older than ACTIVITY_RETENTION_DAYS (default 730)
 * - READ notifications older than NOTIFICATION_RETENTION_DAYS (default 90);
 *   unread ones are kept until read.
 *
 * Deletes in bounded batches so one run never holds long locks on a big table.
 */
import { defaultDb, type Db } from "@/services/_shared/db"

export { DEFAULT_ACTIVITY_RETENTION_DAYS, DEFAULT_NOTIFICATION_RETENTION_DAYS } from "./retention-defaults"
const DAY_MS = 86_400_000
/** Rows per delete statement. */
export const PURGE_BATCH = 1000
/** Safety bound of batches per table per run (the rest goes next day). */
const MAX_BATCHES = 200

export interface RetentionOptions {
  activityDays: number
  notificationDays: number
  now?: () => Date
  db?: Db
}

export interface RetentionResult {
  activity: { days: number; deleted: number }
  notifications: { days: number; deleted: number }
}

export function cutoff(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS)
}

/** Delete matching rows batch by batch (select ids → deleteMany by id). */
async function deleteInBatches(
  findIds: () => Promise<Array<{ id: string }>>,
  deleteIds: (ids: string[]) => Promise<{ count: number }>
): Promise<number> {
  let total = 0
  for (let i = 0; i < MAX_BATCHES; i++) {
    const ids = (await findIds()).map((r) => r.id)
    if (ids.length === 0) break
    total += (await deleteIds(ids)).count
    if (ids.length < PURGE_BATCH) break
  }
  return total
}

export async function purgeCollaborationHistory(opts: RetentionOptions): Promise<RetentionResult> {
  const db = opts.db ?? defaultDb
  const now = (opts.now ?? (() => new Date()))()
  const activityBefore = cutoff(now, opts.activityDays)
  const notificationBefore = cutoff(now, opts.notificationDays)

  const activityDeleted = await deleteInBatches(
    () => db.activityLog.findMany({ where: { createdAt: { lt: activityBefore } }, select: { id: true }, take: PURGE_BATCH }),
    (ids) => db.activityLog.deleteMany({ where: { id: { in: ids } } })
  )
  const readWhere = { readAt: { not: null }, createdAt: { lt: notificationBefore } }
  const notificationsDeleted = await deleteInBatches(
    () => db.notification.findMany({ where: readWhere, select: { id: true }, take: PURGE_BATCH }),
    (ids) => db.notification.deleteMany({ where: { id: { in: ids } } })
  )
  return {
    activity: { days: opts.activityDays, deleted: activityDeleted },
    notifications: { days: opts.notificationDays, deleted: notificationsDeleted },
  }
}
