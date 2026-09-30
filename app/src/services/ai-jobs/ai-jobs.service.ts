import { defaultDb } from "@/services/_shared/db"
import { ForbiddenError, NotFoundError, StatusError, isUniqueViolation } from "@/services/_shared/errors"
import type { Actor } from "@/services/_shared/actor"
import {
  activeJobKey,
  aiJobsEnabled,
  resolveAiJobRunner,
  type AiJobKind,
  type AiJobRunnerLocation,
} from "@/lib/ai-jobs/config"
import * as repo from "./ai-jobs.repository"
import type { CreateAiJobInput } from "./ai-jobs.schemas"

/**
 * Background AI report jobs — the API side. Queuing is idempotent per
 * project + kind (+ scope): while a job is queued or running, a second
 * request gets that job back (`deduped: true`) instead of a new one. The
 * UNIQUE(activeKey) index enforces it across concurrent requests.
 */

/** Queued / running jobs listed per project (a handful in practice). */
const ACTIVE_LIST_MAX = 20
const ERROR_MAX = 500

export interface AiJobDto {
  id: string
  kind: string
  status: string
  progress: number | null
  params: Record<string, unknown>
  resultReportId: string | null
  error: string | null
  requestedBy: { id: string; name: string } | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}

export function parseParams(raw: string | null): Record<string, unknown> {
  if (!raw) return {}
  try {
    const v = JSON.parse(raw) as unknown
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export function toAiJobDto(row: repo.JobRow): AiJobDto {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    progress: row.progress,
    params: parseParams(row.params),
    resultReportId: row.resultReportId,
    error: row.error ? row.error.slice(0, ERROR_MAX) : null,
    requestedBy: row.user ? { id: row.user.id, name: row.user.name } : null,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
  }
}

export interface EnqueueInput {
  projectId: string
  /** Requester (notified when done); null = system. */
  userId: string | null
  kind: AiJobKind
  params: Record<string, unknown>
  /** Dedupe scope inside project + kind (e.g. the sprint id of a review). */
  scope?: string | null
}

/** Queue a job, or return the active one with the same key. */
export async function enqueueAiJob(input: EnqueueInput): Promise<{ job: AiJobDto; deduped: boolean }> {
  const activeKey = activeJobKey(input.projectId, input.kind, input.scope)
  const data = { projectId: input.projectId, userId: input.userId, kind: input.kind, params: JSON.stringify(input.params), activeKey }
  // Two tries: the active job may finish between the failed insert and the lookup.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return { job: toAiJobDto(await repo.insertJob(defaultDb, data)), deduped: false }
    } catch (err) {
      if (!isUniqueViolation(err)) throw err
      const active = await repo.findActiveByKey(defaultDb, activeKey)
      if (active) return { job: toAiJobDto(active), deduped: true }
    }
  }
  throw new StatusError(409, "AI job is already queued", {}, "CONFLICT")
}

function assertEnabled(): void {
  if (!aiJobsEnabled(process.env)) {
    throw new StatusError(503, "Background AI jobs are disabled", { reason: "ai_jobs_disabled" }, "SERVICE_UNAVAILABLE")
  }
}

/** POST /ai/jobs — a user asks for a report. 503 `reason: ai_jobs_disabled` when no runner is configured. */
export async function requestAiJob(projectId: string, input: CreateAiJobInput, actor: Actor) {
  assertEnabled()
  return enqueueAiJob({ projectId, userId: actor.userId, kind: input.kind, params: { lang: input.lang } })
}

export async function getAiJob(projectId: string, jobId: string): Promise<AiJobDto> {
  const row = await repo.findJob(defaultDb, projectId, jobId)
  if (!row) throw new NotFoundError("AI job not found")
  return toAiJobDto(row)
}

export async function listActiveAiJobs(projectId: string): Promise<{ items: AiJobDto[]; runner: AiJobRunnerLocation }> {
  const rows = await repo.findActiveJobs(defaultDb, projectId, ACTIVE_LIST_MAX)
  return { items: rows.map(toAiJobDto), runner: resolveAiJobRunner(process.env) }
}

/**
 * Cancel a queued / running job: the requester, or anyone allowed to manage
 * the project (`canManage` = project.update). A running job stops at its next
 * cancellation check (a few seconds).
 */
export async function cancelAiJob(projectId: string, jobId: string, actor: Actor, canManage: boolean): Promise<AiJobDto> {
  const row = await repo.findJob(defaultDb, projectId, jobId)
  if (!row) throw new NotFoundError("AI job not found")
  if (row.userId !== actor.userId && !canManage) throw new ForbiddenError("Only the requester can cancel this job")
  await repo.markCancelled(defaultDb, row.id, new Date())
  return getAiJob(projectId, jobId)
}
