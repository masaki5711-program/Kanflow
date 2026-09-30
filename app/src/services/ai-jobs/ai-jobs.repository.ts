import type { Db } from "@/services/_shared/db"
import { ACTIVE_JOB_STATUSES } from "@/lib/ai-jobs/config"

/**
 * AiJob data access. Status transitions are conditional updates
 * (`updateMany where status = ...`) so two processes can never both claim a
 * job, and a job cancelled while running is never overwritten by the runner.
 */

export const JOB_SELECT = {
  id: true,
  projectId: true,
  userId: true,
  kind: true,
  params: true,
  status: true,
  progress: true,
  attempts: true,
  resultReportId: true,
  error: true,
  createdAt: true,
  startedAt: true,
  finishedAt: true,
  user: { select: { id: true, name: true } },
} as const

export interface JobRow {
  id: string
  projectId: string
  userId: string | null
  kind: string
  params: string | null
  status: string
  progress: number | null
  attempts: number
  resultReportId: string | null
  error: string | null
  createdAt: Date
  startedAt: Date | null
  finishedAt: Date | null
  user: { id: string; name: string } | null
}

export interface NewJob {
  projectId: string
  userId: string | null
  kind: string
  params: string | null
  activeKey: string
}

export function insertJob(db: Db, job: NewJob): Promise<JobRow> {
  return db.aiJob.create({ data: { ...job, status: "queued" }, select: JOB_SELECT })
}

export function findActiveByKey(db: Db, activeKey: string): Promise<JobRow | null> {
  return db.aiJob.findFirst({ where: { activeKey }, select: JOB_SELECT })
}

export function findJob(db: Db, projectId: string, jobId: string): Promise<JobRow | null> {
  return db.aiJob.findFirst({ where: { id: jobId, projectId }, select: JOB_SELECT })
}

/** Queued / running jobs of a project (the reports panel), oldest first. */
export function findActiveJobs(db: Db, projectId: string, take: number): Promise<JobRow[]> {
  return db.aiJob.findMany({
    where: { projectId, status: { in: [...ACTIVE_JOB_STATUSES] } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take,
    select: JOB_SELECT,
  })
}

/** queued | running → cancelled (frees the dedupe key). Returns false when it already finished. */
export async function markCancelled(db: Db, jobId: string, at: Date): Promise<boolean> {
  const { count } = await db.aiJob.updateMany({
    where: { id: jobId, status: { in: [...ACTIVE_JOB_STATUSES] } },
    data: { status: "cancelled", activeKey: null, finishedAt: at },
  })
  return count === 1
}

// --- runner side -------------------------------------------------------------

export function findOldestQueued(db: Db): Promise<{ id: string } | null> {
  return db.aiJob.findFirst({ where: { status: "queued" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true } })
}

/** queued → running; false when another process got it first. */
export async function markRunning(db: Db, jobId: string, at: Date): Promise<boolean> {
  const { count } = await db.aiJob.updateMany({
    where: { id: jobId, status: "queued" },
    data: { status: "running", startedAt: at, progress: 0, attempts: { increment: 1 } },
  })
  return count === 1
}

export function loadJob(db: Db, jobId: string): Promise<JobRow | null> {
  return db.aiJob.findUnique({ where: { id: jobId }, select: JOB_SELECT })
}

export async function updateProgress(db: Db, jobId: string, progress: number): Promise<void> {
  await db.aiJob.updateMany({ where: { id: jobId, status: "running" }, data: { progress } })
}

export async function markDone(db: Db, jobId: string, reportId: string, at: Date): Promise<boolean> {
  const { count } = await db.aiJob.updateMany({
    where: { id: jobId, status: "running" },
    data: { status: "done", progress: 100, resultReportId: reportId, activeKey: null, finishedAt: at, error: null },
  })
  return count === 1
}

export async function markFailed(db: Db, jobId: string, error: string, at: Date): Promise<boolean> {
  const { count } = await db.aiJob.updateMany({
    where: { id: jobId, status: "running" },
    data: { status: "failed", activeKey: null, finishedAt: at, error },
  })
  return count === 1
}

/** running → queued (graceful shutdown); the attempt does not count. */
export async function markRequeued(db: Db, jobId: string): Promise<void> {
  await db.aiJob.updateMany({
    where: { id: jobId, status: "running" },
    data: { status: "queued", startedAt: null, progress: null, attempts: { decrement: 1 } },
  })
}

export async function readStatus(db: Db, jobId: string): Promise<string | null> {
  const row = await db.aiJob.findUnique({ where: { id: jobId }, select: { status: true } })
  return row?.status ?? null
}

/** Running jobs whose process died: back to queued while attempts remain, else failed. */
export async function sweepStale(db: Db, startedBefore: Date, maxAttempts: number, at: Date, error: string) {
  const where = { status: "running", startedAt: { lt: startedBefore } }
  const requeued = await db.aiJob.updateMany({
    where: { ...where, attempts: { lt: maxAttempts } },
    data: { status: "queued", startedAt: null, progress: null },
  })
  const failed = await db.aiJob.updateMany({
    where,
    data: { status: "failed", activeKey: null, finishedAt: at, error },
  })
  return { requeued: requeued.count, failed: failed.count }
}

/** Finished jobs older than the cutoff (retention). */
export async function deleteFinishedBefore(db: Db, before: Date): Promise<number> {
  const { count } = await db.aiJob.deleteMany({
    where: { status: { in: ["done", "failed", "cancelled"] }, createdAt: { lt: before } },
  })
  return count
}
