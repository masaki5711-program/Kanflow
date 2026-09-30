import { defaultDb, type Db } from "@/services/_shared/db"
import { notify } from "@/services/_shared/notifications"
import type { ClaimedJob, JobOutcome } from "./runner"

/**
 * Tell the requester that their background report is ready (or failed).
 * System jobs without a requester notify nobody. One notification per job
 * (dedupeKey). Never throws (notify() absorbs failures).
 */
export async function notifyJobFinished(job: ClaimedJob, outcome: JobOutcome, db: Db = defaultDb): Promise<number> {
  if (!job.userId) return 0
  if (outcome.status === "done") {
    return notify(db, {
      recipientIds: [job.userId],
      type: "ai_report_ready",
      projectId: job.projectId,
      entityType: "ai_report",
      entityId: outcome.result.reportId,
      payload: { jobId: job.id, kind: job.kind, reportId: outcome.result.reportId, title: outcome.result.title },
      dedupeKey: `ai_report_ready:${job.id}`,
    })
  }
  return notify(db, {
    recipientIds: [job.userId],
    type: "ai_report_failed",
    projectId: job.projectId,
    entityType: "ai_job",
    entityId: job.id,
    payload: { jobId: job.id, kind: job.kind, error: outcome.error.slice(0, 300) },
    dedupeKey: `ai_report_failed:${job.id}`,
  })
}
