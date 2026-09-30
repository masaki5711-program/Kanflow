import { parseWorkerMode } from "@/lib/translation/worker-mode"

/**
 * Background AI report jobs (AiJob table) — kinds, statuses and where the job
 * runner lives. Pure (no I/O), safe for client imports.
 *
 * Runner location (AI_JOB_RUNNER, default `auto`):
 * - `auto` follows AI_TRANSLATION_WORKER, like the translation loop:
 *   external → the standalone worker runs jobs; inprocess → every `next start`
 *   runs them (next dev only with AI_TRANSLATION_WORKER_IN_DEV=true);
 *   off → no runner.
 * - `worker` / `web` / `off` force a location.
 * With no runner the API refuses to queue (503) and the dashboard falls back
 * to the synchronous streaming endpoints.
 */

export const AI_JOB_KINDS = ["progress_report", "sprint_review"] as const
export type AiJobKind = (typeof AI_JOB_KINDS)[number]

/** Kinds a user may request through POST /ai/jobs (sprint_review is queued by the sprint service). */
export const USER_REQUESTABLE_KINDS = ["progress_report"] as const satisfies readonly AiJobKind[]

export const AI_JOB_STATUSES = ["queued", "running", "done", "failed", "cancelled"] as const
export type AiJobStatus = (typeof AI_JOB_STATUSES)[number]
export const ACTIVE_JOB_STATUSES = ["queued", "running"] as const satisfies readonly AiJobStatus[]

export function isActiveStatus(status: string): boolean {
  return (ACTIVE_JOB_STATUSES as readonly string[]).includes(status)
}

/** Dedupe key while queued / running: one active job per project + kind (+ scope, e.g. the sprint). */
export function activeJobKey(projectId: string, kind: AiJobKind, scope?: string | null): string {
  return scope ? `${projectId}:${kind}:${scope}` : `${projectId}:${kind}`
}

export type AiJobRunnerLocation = "worker" | "web" | "off"

type Env = Readonly<Record<string, string | undefined>>

const WORKER = new Set(["worker", "external"])
const WEB = new Set(["web", "inprocess", "in-process"])
const OFF = new Set(["off", "false", "0", "no", "disabled", "none"])

function isTruthy(raw: string | undefined): boolean {
  const v = (raw ?? "").trim().toLowerCase()
  return v === "true" || v === "1" || v === "yes" || v === "on"
}

/** Where jobs run (see the module comment). Unknown AI_JOB_RUNNER values mean `auto`. */
export function resolveAiJobRunner(env: Env): AiJobRunnerLocation {
  const raw = (env.AI_JOB_RUNNER ?? "").trim().toLowerCase()
  if (WORKER.has(raw)) return "worker"
  if (WEB.has(raw)) return "web"
  if (OFF.has(raw)) return "off"
  const mode = parseWorkerMode(env.AI_TRANSLATION_WORKER)
  return mode === "external" ? "worker" : mode === "inprocess" ? "web" : "off"
}

/** May the API queue jobs? (Somebody is expected to run them.) */
export function aiJobsEnabled(env: Env): boolean {
  return resolveAiJobRunner(env) !== "off"
}

/** Should THIS Next.js process run the job loop? */
export function decideWebJobRunner(env: Env): { start: boolean; reason: string } {
  const location = resolveAiJobRunner(env)
  if (location !== "web") return { start: false, reason: `AI job runner location: ${location}` }
  if (env.NODE_ENV === "development" && !isTruthy(env.AI_TRANSLATION_WORKER_IN_DEV)) {
    return { start: false, reason: "next dev: set AI_TRANSLATION_WORKER_IN_DEV=true to run AI jobs in this process" }
  }
  return { start: true, reason: "AI job runner location: web" }
}

/** Should the standalone worker run the job loop? */
export function workerRunsAiJobs(env: Env): boolean {
  return resolveAiJobRunner(env) === "worker"
}
