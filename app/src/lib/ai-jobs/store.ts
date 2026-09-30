import { defaultDb, type Db } from "@/services/_shared/db"
import * as repo from "@/services/ai-jobs/ai-jobs.repository"
import { parseParams } from "@/services/ai-jobs/ai-jobs.service"
import type { AiJobStore, ClaimedJob } from "./runner"

/** A crashed runner's job, failed for good after the last attempt. */
const INTERRUPTED = "interrupted: the process running this job stopped unexpectedly"

/** AiJobStore over the AiJob table. */
export function createAiJobStore(db: Db = defaultDb, now: () => Date = () => new Date()): AiJobStore {
  return {
    sweepStale: (startedBefore, maxAttempts) => repo.sweepStale(db, startedBefore, maxAttempts, now(), INTERRUPTED),
    async claimNext(): Promise<ClaimedJob | null> {
      // A lost race (another runner claimed it) simply looks at the next one.
      for (let i = 0; i < 3; i++) {
        const next = await repo.findOldestQueued(db)
        if (!next) return null
        if (!(await repo.markRunning(db, next.id, now()))) continue
        const row = await repo.loadJob(db, next.id)
        if (!row) return null
        return { id: row.id, projectId: row.projectId, userId: row.userId, kind: row.kind, params: parseParams(row.params), attempts: row.attempts }
      }
      return null
    },
    setProgress: (jobId, progress) => repo.updateProgress(db, jobId, progress),
    complete: (jobId, reportId) => repo.markDone(db, jobId, reportId, now()),
    fail: (jobId, error) => repo.markFailed(db, jobId, error, now()),
    requeue: (jobId) => repo.markRequeued(db, jobId),
    statusOf: (jobId) => repo.readStatus(db, jobId),
  }
}
