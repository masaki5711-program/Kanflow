import { isActiveStatus } from "@/lib/ai-jobs/config"
import type { Translations } from "@/lib/i18n"

/**
 * Client side of the background AI report jobs (POST/GET
 * /api/projects/:id/ai/jobs). Pure helpers + types; the hook lives in
 * use-ai-job.ts.
 */

/** GET /ai/jobs/:jobId (see services/ai-jobs AiJobDto). */
export interface AiJobView {
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

/** Window event fired when a report was produced (the reports panel refetches). */
export const AI_REPORTS_CHANGED_EVENT = "kanflow:ai-reports-changed"

export function emitAiReportsChanged(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(AI_REPORTS_CHANGED_EVENT))
}

export function jobsUrl(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/ai/jobs`
}

export function jobUrl(projectId: string, jobId: string): string {
  return `${jobsUrl(projectId)}/${encodeURIComponent(jobId)}`
}

export function isJobActive(job: Pick<AiJobView, "status"> | null | undefined): boolean {
  return !!job && isActiveStatus(job.status)
}

/** 503 `{ reason: "ai_jobs_disabled" }` — no runner; use the streaming endpoint instead. */
export function isJobsDisabledError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false
  const e = err as { status?: unknown; body?: unknown }
  const body = e.body && typeof e.body === "object" ? (e.body as { reason?: unknown }) : null
  return e.status === 503 && body?.reason === "ai_jobs_disabled"
}

export type ChipTone = "neutral" | "primary" | "success" | "danger"

/** Localized status text + badge tone (progress shown while running). */
export function describeJobStatus(job: Pick<AiJobView, "status" | "progress">, t: Translations): { label: string; tone: ChipTone } {
  switch (job.status) {
    case "queued":
      return { label: t.aiJobStatusQueued, tone: "neutral" }
    case "running": {
      const pct = job.progress && job.progress > 0 ? ` ${t.aiJobProgress.replace("{pct}", String(job.progress))}` : ""
      return { label: `${t.aiJobStatusRunning}${pct}`, tone: "primary" }
    }
    case "done":
      return { label: t.aiJobStatusDone, tone: "success" }
    case "failed":
      return { label: t.aiJobStatusFailed, tone: "danger" }
    default:
      return { label: t.aiJobStatusCancelled, tone: "neutral" }
  }
}

function isJobView(value: unknown): value is AiJobView {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  return typeof v.id === "string" && typeof v.kind === "string" && typeof v.status === "string"
}

/** `{ items }` body → well-formed jobs only. */
export function toJobList(raw: unknown): AiJobView[] {
  const items = raw && typeof raw === "object" ? (raw as { items?: unknown }).items : undefined
  return Array.isArray(items) ? items.filter(isJobView) : []
}
