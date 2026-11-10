/**
 * AI review of finalized actuals (handoff 2026-11-05 "次の案" 1, plan 12 §3.4 "LLM の役割"), as a night batch.
 *
 * For each queued request (plan_actuals_review_job, one per finalized snapshot) the batch reads, NOW:
 *   - the snapshot's complete leaves (name, planned / actual days, slip, waiting and on-hold days) — never an owner;
 *   - each leaf's plan-row description and notes AS FINALIZED (frozen on the leaf: a later edit of the live plan cannot
 *     steer the review, and a quote always matches the record);
 *   - the finalizer's note (確定の時のメモ);
 * leaves out every leaf citing a PBI that is confidential, trashed or gone NOW (D-5, use time: not even its name), builds
 * the one visible input (bounded as E6: 6,000 characters of escaped data, whole leaves, the largest deviation first),
 * asks the LLM at BACKGROUND priority, validates the answer (one retry without sending the answer back, then failed) and
 * stores the surviving proposals as `pending` rows. A proposal changes nothing: a PO / SM accepts or rejects it on the
 * actuals screen (services/plan-actuals/actuals-review.service.ts), and only accepting changes how learning uses a leaf.
 *
 * Ollama down or slow: the request goes back to the queue for the next night (up to MAX_ATTEMPTS), then fails —
 * logged, never counted as done. A superseded snapshot (re-finalized meanwhile) is skipped: its successor has its own
 * request. With PLAN_LLM_ASSIST=off nothing is sent and the queue stays; learning works as before (deterministic path).
 */
import { logger } from "@/lib/logger"
import { ACTUALS_REVIEW_PROMPT_VERSION, planLlmConfig, type PlanLlmConfig } from "@/lib/plan-llm/config"
import { parseActualsReview, type ReviewDropReason } from "@/lib/plan-llm/parse"
import { runLlmTask, type PlanLlm } from "@/lib/plan-llm/run"
import { actualsReviewInput, byReviewOrder, type RawReviewItem } from "@/lib/plan-llm/visible"
import { defaultDb, withTransaction, type Db } from "@/services/_shared/db"
import { leavesCitingConfidentialPbis } from "@/services/plan-actuals/actuals.learnable"

const log = logger.child({ module: "plan-llm-actuals-review" })

/** Nights a request is tried while Ollama is down or slow. */
export const MAX_ATTEMPTS = 3
/** Requests per batch run (the rest wait for the next night). */
export const BATCH_MAX = 20
/** A `running` request older than this belongs to a batch that died: it goes back to the queue. */
export const STALE_RUNNING_MS = 60 * 60_000
/** Pending proposals a project may hold (a person decides each; more would not be read). */
export const PENDING_PER_PROJECT_MAX = 30
/** A pending proposal nobody decided for this long expires (it no longer counts against the cap). */
export const PENDING_EXPIRES_MS = 90 * 86_400_000
/** Leaves read per snapshot before ordering (a project rarely has more). */
const LEAVES_READ_MAX = 2_000

export type ReviewJobOutcome = "done" | "skipped" | "requeued" | "failed" | "lost"

export interface ReviewJobResult {
  jobId: string
  outcome: ReviewJobOutcome
  created: number
  dropped: number
  reason?: string
}

/** The leaves and note of one request, read at use time (confidentiality now, this project only). */
export async function collectReviewSources(projectId: string, snapshotId: string, db: Db = defaultDb): Promise<{ note: { snapshotId: string; text: string | null } | null; items: RawReviewItem[] }> {
  const snapshot = await db.planActualsSnapshot.findFirst({ where: { id: snapshotId, projectId }, select: { id: true, finalizeNote: true } })
  if (!snapshot) return { note: null, items: [] }
  const leaves = await db.planActualsItem.findMany({
    // A leaf that already has a proposal (a decision carried over from the replaced record) is not proposed again.
    where: { snapshotId, complete: true, reviewProposals: { none: {} } },
    orderBy: { id: "asc" },
    take: LEAVES_READ_MAX,
    select: { id: true, name: true, notes: true, plannedDays: true, actualDays: true, endSlipDays: true, waitGapDays: true, onHoldDays: true },
  })
  const confidential = await leavesCitingConfidentialPbis(
    leaves.map((l) => l.id),
    db
  )
  const items: RawReviewItem[] = leaves
    .map((l) => ({
      snapshotItemId: l.id,
      projectId,
      name: l.name,
      plannedDays: l.plannedDays,
      actualDays: l.actualDays,
      endSlipDays: l.endSlipDays,
      waitGapDays: l.waitGapDays,
      onHoldDays: l.onHoldDays,
      notes: l.notes,
      confidentialNow: confidential.has(l.id),
    }))
    .sort(byReviewOrder)
  return { note: { snapshotId: snapshot.id, text: snapshot.finalizeNote }, items }
}

function countReasons(dropped: readonly { reason: ReviewDropReason }[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const d of dropped) out[d.reason] = (out[d.reason] ?? 0) + 1
  return out
}

export interface ClaimedReviewJob {
  id: string
  projectId: string
  snapshotId: string
  attempts: number
  /** When THIS batch claimed it: every later write is conditional on it (a recovered job is not ours any more). */
  startedAt: Date
}

type JobUpdate = Parameters<Db["planActualsReviewJob"]["updateMany"]>[0]["data"]

/** The request was recovered and re-claimed by another batch meanwhile: nothing this batch did is recorded. */
export class LostReviewClaimError extends Error {
  constructor(readonly jobId: string) {
    super(`actuals-review request ${jobId} was taken over by another batch`)
    this.name = "LostReviewClaimError"
  }
}

/** Write the request's outcome only while this batch still holds it (status running, same claim time). */
async function settle(db: Db, job: ClaimedReviewJob, data: JobUpdate): Promise<void> {
  const res = await db.planActualsReviewJob.updateMany({ where: { id: job.id, status: "running", startedAt: job.startedAt }, data })
  if (res.count !== 1) throw new LostReviewClaimError(job.id)
}

const finishJob = (db: Db, job: ClaimedReviewJob, data: JobUpdate) => settle(db, job, { ...data, finishedAt: new Date() })

/**
 * Process one claimed request. Never throws for an LLM failure; a database failure propagates (the batch logs it), and
 * LostReviewClaimError when another batch took the request over (its proposals roll back with the outcome).
 */
export async function processActualsReviewJob(job: ClaimedReviewJob, llm: PlanLlm, config: PlanLlmConfig, db: Db = defaultDb, signal?: AbortSignal): Promise<ReviewJobResult> {
  const snapshot = await db.planActualsSnapshot.findFirst({ where: { id: job.snapshotId, projectId: job.projectId }, select: { supersededAt: true } })
  if (!snapshot || snapshot.supersededAt !== null) {
    const reason = snapshot ? "superseded" : "snapshot_gone"
    await finishJob(db, job, { status: "skipped", lastError: reason })
    return { jobId: job.id, outcome: "skipped", created: 0, dropped: 0, reason }
  }
  const raw = await collectReviewSources(job.projectId, job.snapshotId, db)
  const built = actualsReviewInput(job.projectId, raw.note, raw.items)
  if (built.omitted > 0) log.warn("actuals-review leaves left out to fit the prompt", { jobId: job.id, projectId: job.projectId, omitted: built.omitted, kept: built.input.items.length })
  if (built.input.items.length === 0) {
    const reason = built.omitted > 0 ? "prompt_budget" : "no_items"
    await finishJob(db, job, { status: "skipped", lastError: reason })
    return { jobId: job.id, outcome: "skipped", created: 0, dropped: 0, reason }
  }
  const outcome = await runLlmTask(llm, built.input, (text) => parseActualsReview(text, built), { priority: "background", timeoutMs: config.batchTimeoutMs, signal, label: "plan-actuals-review" })
  const meta = { llmModel: llm.model, promptVersion: ACTUALS_REVIEW_PROMPT_VERSION, sourceIds: built.sourceIds }
  if (!outcome.ok) {
    // An invalid answer twice is final; anything else (down, slow, an error status, a shutdown) is tried another night.
    const shutdown = outcome.reason === "aborted" && signal?.aborted === true
    if (outcome.reason !== "invalid" && (shutdown || job.attempts < MAX_ATTEMPTS)) {
      await settle(db, job, { ...meta, status: "queued", startedAt: null, lastError: `llm ${outcome.reason}`, ...(shutdown ? { attempts: { decrement: 1 } } : {}) })
      log.warn("actuals review postponed: the LLM did not answer", { jobId: job.id, projectId: job.projectId, reason: outcome.reason, attempt: job.attempts })
      return { jobId: job.id, outcome: "requeued", created: 0, dropped: 0, reason: outcome.reason }
    }
    await finishJob(db, job, { ...meta, status: "failed", lastError: `llm ${outcome.reason}` })
    log.error("actuals review failed; no proposal was written", { jobId: job.id, projectId: job.projectId, reason: outcome.reason, attempts: job.attempts })
    return { jobId: job.id, outcome: "failed", created: 0, dropped: 0, reason: outcome.reason }
  }
  // The proposals and the outcome commit together, under the project's actuals lock (the one finalize takes): a
  // re-finalize cannot slip in between the check below and the insert. A request another batch took over rolls back.
  const written = await withTransaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`plan_actuals:${job.projectId}`}))`
    // A snapshot re-finalized while the model answered gets nothing (its successor is reviewed on its own).
    const current = await tx.planActualsSnapshot.findFirst({ where: { id: job.snapshotId, supersededAt: null }, select: { id: true } })
    if (!current) {
      await finishJob(tx, job, { ...meta, status: "skipped", lastError: "superseded" })
      return null
    }
    // Use time again: a leaf whose PBI became confidential while the model answered gets no proposal.
    const nowConfidential = await leavesCitingConfidentialPbis(
      outcome.value.proposals.map((p) => p.snapshotItemId),
      tx
    )
    const usable = outcome.value.proposals.filter((p) => !nowConfidential.has(p.snapshotItemId))
    // Only pending proposals of CURRENT snapshots count (a replaced snapshot's are superseded).
    const pending = await tx.planActualsReviewProposal.count({ where: { projectId: job.projectId, state: "pending", snapshot: { supersededAt: null } } })
    const room = Math.max(PENDING_PER_PROJECT_MAX - pending, 0)
    const kept = usable.slice(0, room)
    const capped = usable.length - kept.length
    const res = kept.length
      ? await tx.planActualsReviewProposal.createMany({
          data: kept.map((p) => ({ projectId: job.projectId, snapshotId: job.snapshotId, snapshotItemId: p.snapshotItemId, jobId: job.id, kind: p.kind, quote: p.quote, quoteSource: p.quoteSource, confidence: p.confidence, llmModel: llm.model, promptVersion: ACTUALS_REVIEW_PROMPT_VERSION })),
          // A leaf that already has a proposal keeps it (at most one per leaf).
          skipDuplicates: true,
        })
      : { count: 0 }
    const refused = outcome.value.proposals.length - res.count
    await finishJob(tx, job, { ...meta, status: "done", proposalsCreated: res.count, proposalsDropped: outcome.value.dropped.length + refused, proposalsCapped: capped, lastError: null })
    return { created: res.count, refused, capped }
  })
  if (!written) {
    log.info("actuals review discarded: the snapshot was re-finalized while the model answered", { jobId: job.id, projectId: job.projectId })
    return { jobId: job.id, outcome: "skipped", created: 0, dropped: 0, reason: "superseded" }
  }
  const { created, refused, capped } = written
  if (capped > 0) log.warn("actuals-review proposals over the per-project cap were not written", { jobId: job.id, projectId: job.projectId, capped, max: PENDING_PER_PROJECT_MAX })
  const dropped = outcome.value.dropped.length + refused
  if (dropped > 0) log.warn("actuals-review proposals dropped", { jobId: job.id, projectId: job.projectId, reasons: countReasons(outcome.value.dropped), refusedAtWrite: refused })
  log.info("actuals-review proposals written", { jobId: job.id, projectId: job.projectId, created, dropped })
  return { jobId: job.id, outcome: "done", created, dropped }
}

/** Claim the oldest queued request not yet seen by this batch (conditional update: safe with two batch processes). */
async function claimNext(db: Db, now: Date, seen: ReadonlySet<string>): Promise<ClaimedReviewJob | null> {
  for (let i = 0; i < 3; i++) {
    const next = await db.planActualsReviewJob.findFirst({ where: { status: "queued", ...(seen.size ? { id: { notIn: [...seen] } } : {}) }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true } })
    if (!next) return null
    const res = await db.planActualsReviewJob.updateMany({ where: { id: next.id, status: "queued" }, data: { status: "running", startedAt: now, attempts: { increment: 1 } } })
    if (res.count !== 1) continue
    const row = await db.planActualsReviewJob.findUniqueOrThrow({ where: { id: next.id }, select: { id: true, projectId: true, snapshotId: true, attempts: true, startedAt: true } })
    return { ...row, startedAt: row.startedAt ?? now }
  }
  return null
}

export interface ReviewBatchResult {
  results: ReviewJobResult[]
  recovered: number
}

/**
 * One night batch: recover requests of a batch that died, then process up to `max` queued requests one at a time.
 * With the assistance off, nothing is sent and the queue is left as it is.
 */
export async function runActualsReviewBatch(opts: {
  llm: PlanLlm | null
  config?: PlanLlmConfig
  db?: Db
  signal?: AbortSignal
  max?: number
  now?: () => Date
  /** Awaited before each request (waits until no web user is waiting for Ollama). */
  waitForTurn?: (signal?: AbortSignal) => Promise<unknown>
}): Promise<ReviewBatchResult> {
  const db = opts.db ?? defaultDb
  const config = opts.config ?? planLlmConfig(process.env)
  const now = opts.now ?? (() => new Date())
  if (!opts.llm || !config.enabled) {
    log.info("actuals-review batch skipped: PLAN_LLM_ASSIST is off")
    return { results: [], recovered: 0 }
  }
  const staleBefore = new Date(now().getTime() - STALE_RUNNING_MS)
  const abandoned = (await db.planActualsReviewJob.updateMany({ where: { status: "running", startedAt: { lt: staleBefore }, attempts: { gte: MAX_ATTEMPTS } }, data: { status: "failed", lastError: "batch_stopped", finishedAt: now() } })).count
  const recovered = (await db.planActualsReviewJob.updateMany({ where: { status: "running", startedAt: { lt: staleBefore } }, data: { status: "queued", startedAt: null } })).count
  if (recovered + abandoned > 0) log.warn("actuals-review requests of a stopped batch recovered", { requeued: recovered, failed: abandoned })
  // Housekeeping: pending proposals of a replaced snapshot are superseded (a finalize does it too; this catches any left),
  // and pending ones nobody decided for 90 days expire. Neither changes learning.
  const superseded = (await db.planActualsReviewProposal.updateMany({ where: { state: "pending", snapshot: { supersededAt: { not: null } } }, data: { state: "superseded" } })).count
  const expired = (await db.planActualsReviewProposal.updateMany({ where: { state: "pending", createdAt: { lt: new Date(now().getTime() - PENDING_EXPIRES_MS) } }, data: { state: "expired" } })).count
  if (superseded + expired > 0) log.info("actuals-review proposals superseded / expired", { superseded, expired })
  const results: ReviewJobResult[] = []
  const seen = new Set<string>()
  const max = opts.max ?? BATCH_MAX
  while (results.length < max && !opts.signal?.aborted) {
    await opts.waitForTurn?.(opts.signal)
    if (opts.signal?.aborted) break
    const job = await claimNext(db, now(), seen)
    if (!job) break
    seen.add(job.id)
    try {
      results.push(await processActualsReviewJob(job, opts.llm, config, db, opts.signal))
    } catch (err) {
      if (err instanceof LostReviewClaimError) {
        log.warn("actuals-review request taken over by another batch; this result is discarded", { jobId: job.id, projectId: job.projectId })
        results.push({ jobId: job.id, outcome: "lost", created: 0, dropped: 0 })
        continue
      }
      // A database failure: back to the queue (bounded by attempts) and the batch stops here. The row keeps a code.
      const message = err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300)
      log.error("actuals-review request failed", { jobId: job.id, projectId: job.projectId, error: message })
      const status = job.attempts < MAX_ATTEMPTS ? "queued" : "failed"
      await settle(db, job, { status, startedAt: null, lastError: "db_error", ...(status === "failed" ? { finishedAt: new Date() } : {}) }).catch((e: unknown) => {
        log.error("could not release an actuals-review request", { jobId: job.id, error: e instanceof Error ? e.message : String(e) })
      })
      results.push({ jobId: job.id, outcome: status === "queued" ? "requeued" : "failed", created: 0, dropped: 0, reason: "error" })
      break
    }
  }
  const count = (o: ReviewJobOutcome) => results.filter((r) => r.outcome === o).length
  const fields = { processed: results.length, created: results.reduce((s, r) => s + r.created, 0), done: count("done"), skipped: count("skipped"), requeued: count("requeued"), failed: count("failed"), lost: count("lost"), recovered }
  if (fields.failed > 0 || fields.requeued > 0) log.warn("actuals-review batch finished with failures", fields)
  else log.info("actuals-review batch finished", fields)
  return { results, recovered }
}
