/**
 * Retention for P3 AI data (worker, part of the daily collab job):
 * - chat threads deleted (trashed) more than CHAT_DELETED_RETENTION_DAYS ago (default 30)
 * - chat threads idle (no message) for more than CHAT_RETENTION_DAYS (default 180)
 * - finished AiJob rows (done / failed / cancelled) older than AI_JOB_RETENTION_DAYS (default 30)
 *
 * Chat messages go with their thread (ON DELETE CASCADE). Threads are removed
 * in bounded batches like the other retention sweeps.
 */
import { defaultDb, type Db } from "@/services/_shared/db"
import { deleteFinishedBefore } from "@/services/ai-jobs/ai-jobs.repository"
import { PURGE_BATCH, cutoff, deleteInBatches } from "./activity-retention"

export interface ChatRetentionOptions {
  idleDays: number
  deletedDays: number
  aiJobDays: number
  now?: () => Date
  db?: Db
}

export interface ChatRetentionResult {
  chatIdle: { days: number; deleted: number }
  chatDeleted: { days: number; deleted: number }
  aiJobs: { days: number; deleted: number }
}

type ThreadWhere = { deletedAt: { lt: Date } } | { updatedAt: { lt: Date } }

function purgeThreads(db: Db, where: ThreadWhere): Promise<number> {
  return deleteInBatches(
    () => db.chatThread.findMany({ where, select: { id: true }, take: PURGE_BATCH }),
    (ids) => db.chatThread.deleteMany({ where: { id: { in: ids } } })
  )
}

export async function purgeChatHistory(opts: ChatRetentionOptions): Promise<ChatRetentionResult> {
  const db = opts.db ?? defaultDb
  const now = (opts.now ?? (() => new Date()))()
  const chatDeleted = await purgeThreads(db, { deletedAt: { lt: cutoff(now, opts.deletedDays) } })
  const chatIdle = await purgeThreads(db, { updatedAt: { lt: cutoff(now, opts.idleDays) } })
  const aiJobs = await deleteFinishedBefore(db, cutoff(now, opts.aiJobDays))
  return {
    chatIdle: { days: opts.idleDays, deleted: chatIdle },
    chatDeleted: { days: opts.deletedDays, deleted: chatDeleted },
    aiJobs: { days: opts.aiJobDays, deleted: aiJobs },
  }
}
