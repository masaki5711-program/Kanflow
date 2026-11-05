/**
 * E6 part 1 (plan 12 §3.4 "LLM の役割" 1): rule drafts at actuals finalization, as a night batch.
 *
 * For each queued request (plan_rule_draft_job, one per finalized snapshot) the batch reads, NOW:
 *   - the project's sprint retrospectives (Problem / Try) — project-internal text, so every draft is `project` scope;
 *   - the project's confirmed lessons of scope `project:<id>` that are not confidential NOW (D-5, use time);
 *   - the finalizer's note (確定の時のメモ);
 *   - the snapshot's item keys and names (so a draft names keys that exist);
 * builds the one visible input, asks the LLM at BACKGROUND priority (behind every user call on the shared Ollama),
 * validates the answer (one retry when invalid, then dropped and logged) and stores the surviving drafts as `draft`
 * rules (createdByKind = llm). Nothing changes a plan until a PO / SM confirms a draft, one at a time, numbers shown.
 *
 * Ollama down or slow: the request goes back to the queue for the next night (up to MAX_ATTEMPTS), then fails —
 * logged, never counted as done. A superseded snapshot (re-finalized meanwhile) is skipped: its successor has its own
 * request.
 */
import { logger } from "@/lib/logger"
import { PLAN_LLM_PROMPT_VERSION, planLlmConfig, type PlanLlmConfig } from "@/lib/plan-llm/config"
import { parseRuleDrafts, type DropReason } from "@/lib/plan-llm/parse"
import { runLlmTask, type PlanLlm } from "@/lib/plan-llm/run"
import { DRAFT_ITEMS_MAX, DRAFT_SOURCES_MAX, ruleDraftInput, type RawDraftSource } from "@/lib/plan-llm/visible"
import { defaultDb, type Db } from "@/services/_shared/db"
import { projectScope } from "@/services/feedback/feedback.access"
import { createLlmDrafts } from "@/services/plan-lesson-rules/lesson-rules.service"

const log = logger.child({ module: "plan-llm-rule-drafts" })

/** Nights a request is tried while Ollama is down or slow. */
export const MAX_ATTEMPTS = 3
/** Requests per batch run (the rest wait for the next night). */
export const BATCH_MAX = 20
/** A `running` request older than this belongs to a batch that died: it goes back to the queue. */
export const STALE_RUNNING_MS = 60 * 60_000
/** Sprints whose retrospectives are read (newest first). */
const SPRINTS_MAX = 20
/** Lessons read. */
const LESSONS_MAX = 20

export type JobOutcome = "done" | "skipped" | "requeued" | "failed"

export interface JobResult {
  jobId: string
  outcome: JobOutcome
  created: number
  dropped: number
  reason?: string
}

/** The sources of one request, read at use time (confidentiality now, this project only). */
export async function collectDraftSources(projectId: string, snapshotId: string, db: Db = defaultDb): Promise<{ sources: RawDraftSource[]; items: { key: string; name: string }[] }> {
  const [snapshot, sprints, lessons, items] = await Promise.all([
    db.planActualsSnapshot.findFirst({ where: { id: snapshotId, projectId }, select: { id: true, finalizeNote: true } }),
    db.sprint.findMany({ where: { projectId }, orderBy: [{ startDate: "desc" }, { id: "asc" }], take: SPRINTS_MAX, select: { id: true, retrospectiveProblem: true, retrospectiveTry: true } }),
    // Only this project's own lessons; global / technology lessons are not this project's text. Confidential ones are
    // filtered here AND by the input constructor (the flag is read now, never frozen).
    db.lesson.findMany({
      where: { scope: projectScope(projectId), state: { in: ["confirmed", "systemized"] }, confidential: false },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: LESSONS_MAX,
      select: { id: true, symptom: true, cause: true, fix: true, confidential: true },
    }),
    db.planActualsItem.findMany({ where: { snapshotId, templateKey: { not: null } }, orderBy: { id: "asc" }, take: DRAFT_ITEMS_MAX, select: { templateKey: true, name: true } }),
  ])
  const sources: RawDraftSource[] = []
  if (snapshot?.finalizeNote) sources.push({ id: `note:${snapshot.id}`, kind: "finalize_note", text: snapshot.finalizeNote, projectId, confidential: false })
  for (const s of sprints) {
    if (s.retrospectiveProblem?.trim()) sources.push({ id: `sprint:${s.id}:problem`, kind: "retro_problem", text: s.retrospectiveProblem, projectId, confidential: false })
    if (s.retrospectiveTry?.trim()) sources.push({ id: `sprint:${s.id}:try`, kind: "retro_try", text: s.retrospectiveTry, projectId, confidential: false })
  }
  for (const l of lessons) {
    const text = [l.symptom, l.cause, l.fix].filter((x): x is string => Boolean(x?.trim())).join("\n")
    sources.push({ id: `lesson:${l.id}`, kind: "lesson", text, projectId, confidential: l.confidential })
  }
  return { sources: sources.slice(0, DRAFT_SOURCES_MAX), items: items.map((i) => ({ key: i.templateKey as string, name: i.name })) }
}

/** The rule's source as stored: a lesson id or a sprint id (the note and the snapshot have no column of their own). */
function sourceColumns(sourceId: string): { sourceLessonId: string | null; sourceSprintId: string | null } {
  if (sourceId.startsWith("lesson:")) return { sourceLessonId: sourceId.slice("lesson:".length), sourceSprintId: null }
  const sprint = /^sprint:(.+):(?:problem|try)$/.exec(sourceId)
  if (sprint) return { sourceLessonId: null, sourceSprintId: sprint[1] }
  return { sourceLessonId: null, sourceSprintId: null }
}

function countReasons(dropped: readonly { reason: DropReason }[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const d of dropped) out[d.reason] = (out[d.reason] ?? 0) + 1
  return out
}

interface ClaimedJob {
  id: string
  projectId: string
  snapshotId: string
  attempts: number
}

async function finishJob(db: Db, jobId: string, data: Parameters<Db["planRuleDraftJob"]["update"]>[0]["data"]): Promise<void> {
  await db.planRuleDraftJob.update({ where: { id: jobId }, data: { ...data, finishedAt: new Date() } })
}

/** Process one claimed request. Never throws for an LLM failure; a database failure propagates (the batch logs it). */
export async function processRuleDraftJob(job: ClaimedJob, llm: PlanLlm, config: PlanLlmConfig, db: Db = defaultDb, signal?: AbortSignal): Promise<JobResult> {
  const snapshot = await db.planActualsSnapshot.findFirst({ where: { id: job.snapshotId, projectId: job.projectId }, select: { supersededAt: true } })
  if (!snapshot || snapshot.supersededAt !== null) {
    await finishJob(db, job.id, { status: "skipped", lastError: snapshot ? "superseded" : "snapshot gone" })
    return { jobId: job.id, outcome: "skipped", created: 0, dropped: 0, reason: "superseded" }
  }
  const raw = await collectDraftSources(job.projectId, job.snapshotId, db)
  const built = ruleDraftInput(job.projectId, raw.sources, raw.items)
  if (built.input.sources.length === 0) {
    await finishJob(db, job.id, { status: "skipped", lastError: "no source text" })
    return { jobId: job.id, outcome: "skipped", created: 0, dropped: 0, reason: "no_sources" }
  }
  const outcome = await runLlmTask(llm, built.input, (text) => parseRuleDrafts(text, built.input), { priority: "background", timeoutMs: config.batchTimeoutMs, signal, label: "plan-rule-drafts" })
  const meta = { llmModel: llm.model, promptVersion: PLAN_LLM_PROMPT_VERSION, sourceIds: built.sourceIds }
  if (!outcome.ok) {
    const retryable = outcome.reason === "timeout" || outcome.reason === "unavailable" || outcome.reason === "aborted"
    if (retryable && job.attempts < MAX_ATTEMPTS) {
      // Back to the queue for the next night (the attempt is counted; an aborted shutdown counts too, bounded).
      await db.planRuleDraftJob.update({ where: { id: job.id }, data: { ...meta, status: "queued", startedAt: null, lastError: `llm ${outcome.reason}` } })
      log.warn("rule drafts postponed: the LLM did not answer", { jobId: job.id, projectId: job.projectId, reason: outcome.reason, attempt: job.attempts })
      return { jobId: job.id, outcome: "requeued", created: 0, dropped: 0, reason: outcome.reason }
    }
    await finishJob(db, job.id, { ...meta, status: "failed", lastError: `llm ${outcome.reason}` })
    log.error("rule drafts failed; no draft was written", { jobId: job.id, projectId: job.projectId, reason: outcome.reason, attempts: job.attempts })
    return { jobId: job.id, outcome: "failed", created: 0, dropped: 0, reason: outcome.reason }
  }
  const drafts = outcome.value.drafts.map((d) => ({ rule: d.rule, quote: d.quote, ...sourceColumns(d.source.id) }))
  const stored = await createLlmDrafts(job.projectId, drafts)
  const dropped = outcome.value.dropped.length + stored.skipped
  await finishJob(db, job.id, { ...meta, status: "done", draftsCreated: stored.created.length, draftsDropped: dropped, lastError: null })
  if (dropped > 0) log.warn("llm rule drafts dropped", { jobId: job.id, projectId: job.projectId, reasons: countReasons(outcome.value.dropped), refusedAtWrite: stored.skipped })
  log.info("llm rule drafts written", { jobId: job.id, projectId: job.projectId, created: stored.created.length, dropped })
  return { jobId: job.id, outcome: "done", created: stored.created.length, dropped }
}

/**
 * Claim the oldest queued request not yet seen by this batch (conditional update: safe with two batch processes). A
 * request put back to the queue in this batch waits for the next night instead of burning its attempts at once.
 */
async function claimNext(db: Db, now: Date, seen: ReadonlySet<string>): Promise<ClaimedJob | null> {
  for (let i = 0; i < 3; i++) {
    const next = await db.planRuleDraftJob.findFirst({ where: { status: "queued", ...(seen.size ? { id: { notIn: [...seen] } } : {}) }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true } })
    if (!next) return null
    const res = await db.planRuleDraftJob.updateMany({ where: { id: next.id, status: "queued" }, data: { status: "running", startedAt: now, attempts: { increment: 1 } } })
    if (res.count !== 1) continue
    return db.planRuleDraftJob.findUniqueOrThrow({ where: { id: next.id }, select: { id: true, projectId: true, snapshotId: true, attempts: true } })
  }
  return null
}

export interface BatchResult {
  results: JobResult[]
  recovered: number
}

/**
 * One night batch: recover requests of a batch that died, then process up to `max` queued requests one at a time.
 * With the assistance off, nothing is sent and the queue is left as it is.
 */
export async function runRuleDraftBatch(opts: {
  llm: PlanLlm | null
  config?: PlanLlmConfig
  db?: Db
  signal?: AbortSignal
  max?: number
  now?: () => Date
  /** Awaited before each request (the worker waits until no web user is waiting for Ollama). */
  waitForTurn?: (signal?: AbortSignal) => Promise<unknown>
}): Promise<BatchResult> {
  const db = opts.db ?? defaultDb
  const config = opts.config ?? planLlmConfig(process.env)
  const now = opts.now ?? (() => new Date())
  if (!opts.llm || !config.enabled) {
    log.info("rule-draft batch skipped: PLAN_LLM_ASSIST is off")
    return { results: [], recovered: 0 }
  }
  const recovered = (await db.planRuleDraftJob.updateMany({ where: { status: "running", startedAt: { lt: new Date(now().getTime() - STALE_RUNNING_MS) } }, data: { status: "queued", startedAt: null } })).count
  if (recovered > 0) log.warn("rule-draft requests of a stopped batch requeued", { recovered })
  const results: JobResult[] = []
  const seen = new Set<string>()
  const max = opts.max ?? BATCH_MAX
  while (results.length < max && !opts.signal?.aborted) {
    await opts.waitForTurn?.(opts.signal)
    if (opts.signal?.aborted) break
    const job = await claimNext(db, now(), seen)
    if (!job) break
    seen.add(job.id)
    try {
      results.push(await processRuleDraftJob(job, opts.llm, config, db, opts.signal))
    } catch (err) {
      // A database failure: the request goes back to the queue (bounded by attempts) and the batch stops here.
      const message = err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300)
      log.error("rule-draft request failed", { jobId: job.id, projectId: job.projectId, error: message })
      const status = job.attempts < MAX_ATTEMPTS ? "queued" : "failed"
      await db.planRuleDraftJob.update({ where: { id: job.id }, data: { status, startedAt: null, lastError: message.slice(0, 500), ...(status === "failed" ? { finishedAt: new Date() } : {}) } }).catch((e: unknown) => {
        log.error("could not release a rule-draft request", { jobId: job.id, error: e instanceof Error ? e.message : String(e) })
      })
      results.push({ jobId: job.id, outcome: status === "queued" ? "requeued" : "failed", created: 0, dropped: 0, reason: "error" })
      break
    }
  }
  log.info("rule-draft batch finished", { processed: results.length, created: results.reduce((s, r) => s + r.created, 0), recovered })
  return { results, recovered }
}
