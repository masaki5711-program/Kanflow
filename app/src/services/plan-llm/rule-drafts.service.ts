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
import { defaultDb, withTransaction, type Db } from "@/services/_shared/db"
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

export type JobOutcome = "done" | "skipped" | "requeued" | "failed" | "lost"

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

export interface ClaimedJob {
  id: string
  projectId: string
  snapshotId: string
  attempts: number
  /** When THIS batch claimed it: every later write is conditional on it (a recovered job is not ours any more). */
  startedAt: Date
}

type JobUpdate = Parameters<Db["planRuleDraftJob"]["updateMany"]>[0]["data"]

/** The request was recovered and re-claimed by another batch meanwhile: nothing this batch did is recorded. */
export class LostClaimError extends Error {
  constructor(readonly jobId: string) {
    super(`rule-draft request ${jobId} was taken over by another batch`)
    this.name = "LostClaimError"
  }
}

/** Write the request's outcome only while this batch still holds it (status running, same claim time). */
async function settle(db: Db, job: ClaimedJob, data: JobUpdate): Promise<void> {
  const res = await db.planRuleDraftJob.updateMany({ where: { id: job.id, status: "running", startedAt: job.startedAt }, data })
  if (res.count !== 1) throw new LostClaimError(job.id)
}

const finishJob = (db: Db, job: ClaimedJob, data: JobUpdate) => settle(db, job, { ...data, finishedAt: new Date() })

/**
 * Process one claimed request. Never throws for an LLM failure; a database failure propagates (the batch logs it), and
 * LostClaimError when another batch took the request over (its drafts are rolled back with the outcome).
 */
export async function processRuleDraftJob(job: ClaimedJob, llm: PlanLlm, config: PlanLlmConfig, db: Db = defaultDb, signal?: AbortSignal): Promise<JobResult> {
  const snapshot = await db.planActualsSnapshot.findFirst({ where: { id: job.snapshotId, projectId: job.projectId }, select: { supersededAt: true } })
  if (!snapshot || snapshot.supersededAt !== null) {
    const reason = snapshot ? "superseded" : "snapshot_gone"
    await finishJob(db, job, { status: "skipped", lastError: reason })
    return { jobId: job.id, outcome: "skipped", created: 0, dropped: 0, reason }
  }
  const raw = await collectDraftSources(job.projectId, job.snapshotId, db)
  const built = ruleDraftInput(job.projectId, raw.sources, raw.items)
  if (built.omitted > 0) log.warn("rule-draft sources left out to fit the prompt", { jobId: job.id, projectId: job.projectId, omitted: built.omitted, kept: built.input.sources.length })
  if (built.input.sources.length === 0) {
    // No text at all, or none that fits the prompt: two different reasons on the row.
    const reason = built.omitted > 0 ? "prompt_budget" : "no_sources"
    await finishJob(db, job, { status: "skipped", lastError: reason })
    return { jobId: job.id, outcome: "skipped", created: 0, dropped: 0, reason }
  }
  const outcome = await runLlmTask(llm, built.input, (text) => parseRuleDrafts(text, built.input), { priority: "background", timeoutMs: config.batchTimeoutMs, signal, label: "plan-rule-drafts" })
  const meta = { llmModel: llm.model, promptVersion: PLAN_LLM_PROMPT_VERSION, sourceIds: built.sourceIds }
  if (!outcome.ok) {
    // An invalid answer twice is final; anything else (down, slow, an error status, a shutdown) is tried another night.
    const shutdown = outcome.reason === "aborted" && signal?.aborted === true
    if (outcome.reason !== "invalid" && (shutdown || job.attempts < MAX_ATTEMPTS)) {
      // Back to the queue for the next night; an attempt cut short by a shutdown is not counted.
      await settle(db, job, { ...meta, status: "queued", startedAt: null, lastError: `llm ${outcome.reason}`, ...(shutdown ? { attempts: { decrement: 1 } } : {}) })
      log.warn("rule drafts postponed: the LLM did not answer", { jobId: job.id, projectId: job.projectId, reason: outcome.reason, attempt: job.attempts })
      return { jobId: job.id, outcome: "requeued", created: 0, dropped: 0, reason: outcome.reason }
    }
    await finishJob(db, job, { ...meta, status: "failed", lastError: `llm ${outcome.reason}` })
    log.error("rule drafts failed; no draft was written", { jobId: job.id, projectId: job.projectId, reason: outcome.reason, attempts: job.attempts })
    return { jobId: job.id, outcome: "failed", created: 0, dropped: 0, reason: outcome.reason }
  }
  const drafts = outcome.value.drafts.map((d) => ({ rule: d.rule, quote: d.quote, ...sourceColumns(d.source.id) }))
  // The drafts and the outcome commit together: a crash in between can neither lose the outcome nor, on a retry, write
  // the drafts twice; a request another batch took over rolls its drafts back.
  const { stored, dropped } = await withTransaction(async (tx) => {
    const stored = await createLlmDrafts(job.projectId, drafts, tx)
    const dropped = outcome.value.dropped.length + stored.skipped
    await finishJob(tx, job, { ...meta, status: "done", draftsCreated: stored.created.length, draftsDropped: dropped, lastError: null })
    return { stored, dropped }
  })
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
    const row = await db.planRuleDraftJob.findUniqueOrThrow({ where: { id: next.id }, select: { id: true, projectId: true, snapshotId: true, attempts: true, startedAt: true } })
    return { ...row, startedAt: row.startedAt ?? now }
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
  const staleBefore = new Date(now().getTime() - STALE_RUNNING_MS)
  // A request that keeps killing its batch must not come back forever: after the last attempt it fails.
  const abandoned = (await db.planRuleDraftJob.updateMany({ where: { status: "running", startedAt: { lt: staleBefore }, attempts: { gte: MAX_ATTEMPTS } }, data: { status: "failed", lastError: "batch_stopped", finishedAt: now() } })).count
  const recovered = (await db.planRuleDraftJob.updateMany({ where: { status: "running", startedAt: { lt: staleBefore } }, data: { status: "queued", startedAt: null } })).count
  if (recovered + abandoned > 0) log.warn("rule-draft requests of a stopped batch recovered", { requeued: recovered, failed: abandoned })
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
      if (err instanceof LostClaimError) {
        // Another batch recovered and re-claimed it (this one ran past STALE_RUNNING_MS): its result stands, not ours.
        log.warn("rule-draft request taken over by another batch; this result is discarded", { jobId: job.id, projectId: job.projectId })
        results.push({ jobId: job.id, outcome: "lost", created: 0, dropped: 0 })
        continue
      }
      // A database failure: the request goes back to the queue (bounded by attempts) and the batch stops here. The
      // detail stays in the log; the row keeps a code (an error text may carry parameter values).
      const message = err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300)
      log.error("rule-draft request failed", { jobId: job.id, projectId: job.projectId, error: message })
      const status = job.attempts < MAX_ATTEMPTS ? "queued" : "failed"
      await settle(db, job, { status, startedAt: null, lastError: "db_error", ...(status === "failed" ? { finishedAt: new Date() } : {}) }).catch((e: unknown) => {
        // Not released: the stale recovery puts it back after STALE_RUNNING_MS (attempts stay bounded).
        log.error("could not release a rule-draft request", { jobId: job.id, error: e instanceof Error ? e.message : String(e) })
      })
      results.push({ jobId: job.id, outcome: status === "queued" ? "requeued" : "failed", created: 0, dropped: 0, reason: "error" })
      break
    }
  }
  const count = (o: JobOutcome) => results.filter((r) => r.outcome === o).length
  const fields = { processed: results.length, created: results.reduce((s, r) => s + r.created, 0), done: count("done"), skipped: count("skipped"), requeued: count("requeued"), failed: count("failed"), lost: count("lost"), recovered }
  if (fields.failed > 0 || fields.requeued > 0) log.warn("rule-draft batch finished with failures", fields)
  else log.info("rule-draft batch finished", fields)
  return { results, recovered }
}
