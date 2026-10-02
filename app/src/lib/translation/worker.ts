import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { aiLog } from "@/lib/ai-monitor"
import { inBackfillWindow } from "./backfill-window"
import { targetsFor } from "./detect-locale"
import { bumpGlossaryUsage, findGlossaryForText } from "./glossary-service"
import { GateBusy, gate } from "./priority-gate"
import { backfillTranslations } from "./service"
import { translateText } from "./translator"
import { BACKOFF_BASE_MS, MAX_ATTEMPTS, RUNNING_TIMEOUT_MS, nextState, type WorkerOutcome } from "./worker-state"
import { parseWorkerMode, type TranslationWorkerMode } from "./worker-mode"
import type { TranslationLocale } from "./types"

/**
 * Background translation worker.
 *
 * - Ticks every 5 s, single-flight. Started by the standalone worker process
 *   (src/worker/main.ts) or — only with AI_TRANSLATION_WORKER=inprocess —
 *   by src/instrumentation.ts (see ./worker-mode.ts).
 * - Idle test: no user-facing AI call in flight and none in the last 3 s
 *   (PriorityGate), else the tick does nothing.
 * - Claims up to 3 pending rows (priority desc, requested_at asc) with
 *   `FOR UPDATE SKIP LOCKED`, so the production service and a dev server
 *   sharing the database never pick the same row.
 * - GateBusy / preempted → row goes back to pending, tick ends. Failure →
 *   attempts+1 (5 → failed). Rows stuck in `running` > 5 min are reset.
 * - Backfill: 15 s after start-up and every 10 min, 200 rows.
 * - Admission hook (setWorkerAdmission): the standalone worker plugs in the
 *   cross-process gate (lib/ai-gate), which can skip a tick or cap its batch.
 * - stopTranslationWorker(): graceful stop — no new ticks, the in-flight
 *   translation is aborted and its rows go back to `pending`.
 */

const TICK_MS = 5_000
const BACKFILL_MS = 10 * 60_000
const BACKFILL_DELAY_MS = 15_000
const BATCH = 3
const QUIET_MS = 3_000
const HTTP_TIMEOUT_MS = 120_000
/** Pending rows scheduled further ahead than this are clock-skewed legacy rows (see clampFutureRequests). */
export const FUTURE_REQUEST_TOLERANCE_MS = MAX_ATTEMPTS * BACKOFF_BASE_MS + 10 * 60_000

type Row = Prisma.FieldTranslationGetPayload<Record<string, never>>

export interface TickResult {
  processed: number
  skipped: string | null
}

/** Per-tick admission decision supplied by the host process. */
export interface WorkerAdmission {
  allow: boolean
  /** Cap on rows claimed this tick (default BATCH). */
  batch?: number
  reason?: string
}

interface WorkerState {
  started: boolean
  stopping: boolean
  running: boolean
  currentTick: Promise<TickResult> | null
  currentBackfill: Promise<number> | null
  admission: (() => WorkerAdmission) | null
  backfilling: boolean
  lastTickAt: number
  lastResult: TickResult | null
  timers: Array<ReturnType<typeof setInterval> | ReturnType<typeof setTimeout>>
}

const g = globalThis as unknown as { __kanflowTranslationWorker?: WorkerState }
const state: WorkerState =
  g.__kanflowTranslationWorker ??
  (g.__kanflowTranslationWorker = {
    started: false,
    stopping: false,
    running: false,
    currentTick: null,
    currentBackfill: null,
    admission: null,
    backfilling: false,
    lastTickAt: 0,
    lastResult: null,
    timers: [],
  })

export function workerMode(): TranslationWorkerMode {
  return parseWorkerMode(process.env.AI_TRANSLATION_WORKER)
}

/** False only when translation is switched off everywhere (AI_TRANSLATION_WORKER=off). */
export function isWorkerEnabled(): boolean {
  return workerMode() !== "off"
}

/** Install (or clear with null) the per-tick admission hook. */
export function setWorkerAdmission(fn: (() => WorkerAdmission) | null): void {
  state.admission = fn
}

export interface WorkerStatus {
  enabled: boolean
  mode: TranslationWorkerMode
  /** True when the loop runs in THIS process. */
  started: boolean
  idle: boolean
  lastTickAt: number
  lastResult: TickResult | null
}

export function workerStatus(): WorkerStatus {
  return {
    enabled: isWorkerEnabled(),
    mode: workerMode(),
    started: state.started,
    idle: gate.isIdle(QUIET_MS) && gate.background_active === 0,
    lastTickAt: state.lastTickAt,
    lastResult: state.lastResult,
  }
}

/** Start the interval timers once per process (safe to call repeatedly). */
export function startTranslationWorker(): void {
  if (state.started) return
  state.started = true
  state.stopping = false
  if (!isWorkerEnabled()) {
    aiLog("XLATE_WORKER", "disabled by AI_TRANSLATION_WORKER=off")
    return
  }
  const tick = setInterval(() => void translationWorkerTick(), TICK_MS)
  const backfill = setInterval(() => void backfillTick(), BACKFILL_MS)
  const first = setTimeout(() => void backfillTick(), BACKFILL_DELAY_MS)
  for (const t of [tick, backfill, first]) t.unref?.()
  state.timers.push(tick, backfill, first)
  aiLog("XLATE_WORKER", `started (tick ${TICK_MS}ms, batch ${BATCH})`)
}

/**
 * Graceful stop: clear the timers, abort the in-flight translation (its rows
 * go back to `pending`, attempts unchanged) and wait — at most `timeoutMs` —
 * for the current tick / backfill to finish their database writes.
 * Resolves true when drained in time.
 */
export async function stopTranslationWorker(opts: { timeoutMs?: number } = {}): Promise<boolean> {
  state.stopping = true
  for (const t of state.timers) clearTimeout(t)
  state.timers = []
  state.started = false
  gate.preemptBackground()
  const pending: Promise<unknown>[] = []
  if (state.currentTick) pending.push(state.currentTick)
  if (state.currentBackfill) pending.push(state.currentBackfill)
  if (pending.length === 0) return true
  let timer: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), opts.timeoutMs ?? 20_000)
  })
  try {
    return await Promise.race([Promise.allSettled(pending).then(() => true), timedOut])
  } finally {
    clearTimeout(timer)
  }
}

export function backfillTick(): Promise<number> {
  if (!isWorkerEnabled() || state.stopping || state.backfilling) return Promise.resolve(0)
  state.backfilling = true
  const run = (async () => {
    try {
      return await backfillTranslations(200)
    } catch (err) {
      aiLog("XLATE_WORKER", `backfill failed: ${err instanceof Error ? err.message : String(err)}`)
      return 0
    } finally {
      state.backfilling = false
      state.currentBackfill = null
    }
  })()
  state.currentBackfill = run
  return run
}

export function translationWorkerTick(): Promise<TickResult> {
  if (!isWorkerEnabled()) return Promise.resolve(remember({ processed: 0, skipped: "disabled" }))
  if (state.stopping) return Promise.resolve({ processed: 0, skipped: "stopping" })
  if (state.running) return Promise.resolve({ processed: 0, skipped: "busy" })
  state.running = true
  const run = runTick().finally(() => {
    state.running = false
    state.currentTick = null
  })
  state.currentTick = run
  return run
}

async function runTick(): Promise<TickResult> {
  try {
    await resetStale()
    if (!gate.isIdle(QUIET_MS)) return remember({ processed: 0, skipped: "ai-busy" })
    const admission = state.admission?.() ?? { allow: true }
    if (!admission.allow) return remember({ processed: 0, skipped: admission.reason ?? "not-admitted" })
    let rows = await claim(Math.max(1, Math.min(BATCH, admission.batch ?? BATCH)))
    // Nothing pending: in the quiet window, add English to one older row at a time.
    if (rows.length === 0 && inBackfillWindow(process.env.TRANSLATION_EN_BACKFILL_HOURS)) rows = await claimEnglishBackfill(1)
    if (rows.length === 0) return remember({ processed: 0, skipped: null })
    let processed = 0
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      // Re-check right before each row: users (and shutdown) always win.
      if (state.stopping || !gate.isIdle(0)) {
        for (const rest of rows.slice(i)) await apply(rest, { kind: "preempted" })
        break
      }
      const outcome = await translateOne(row)
      const applied = await apply(row, outcome)
      if (outcome.kind === "preempted") {
        for (const rest of rows.slice(i + 1)) await apply(rest, { kind: "preempted" })
        break
      }
      if (outcome.kind === "success" && applied) processed += 1
    }
    return remember({ processed, skipped: null })
  } catch (err) {
    aiLog("XLATE_WORKER", `tick failed: ${err instanceof Error ? err.message : String(err)}`)
    return remember({ processed: 0, skipped: "error" })
  }
}

function remember(r: TickResult): TickResult {
  state.lastTickAt = Date.now()
  state.lastResult = r
  return r
}

async function resetStale(): Promise<void> {
  const cutoff = new Date(Date.now() - RUNNING_TIMEOUT_MS)
  await prisma.fieldTranslation.updateMany({
    where: { status: "running", startedAt: { lte: cutoff } },
    data: { status: "pending", startedAt: null },
  })
  await clampFutureRequests()
}

/**
 * Older builds stamped `requested_at` with the server's local NOW(3) (UTC+7)
 * while everything else is UTC, so those rows look hours in the future and
 * the UTC claim below would hold them back. Nothing legitimate is scheduled
 * further ahead than the longest retry backoff, so pull such rows to now.
 */
async function clampFutureRequests(): Promise<void> {
  const now = Date.now()
  await prisma.fieldTranslation.updateMany({
    where: { status: "pending", requestedAt: { gt: new Date(now + FUTURE_REQUEST_TOLERANCE_MS) } },
    data: { requestedAt: new Date(now) },
  })
}

/** Claim pending rows in priority order; SKIP LOCKED keeps concurrent workers apart. */
async function claim(limit: number): Promise<Row[]> {
  return prisma.$transaction(async (tx) => {
    const picked = await tx.$queryRaw<Array<{ entity_type: string; entity_id: string; field: string }>>`
      SELECT entity_type, entity_id, field
      FROM field_translation
      WHERE status = 'pending' AND requested_at <= UTC_TIMESTAMP(3)
      ORDER BY priority DESC, requested_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `
    const rows: Row[] = []
    const now = new Date()
    for (const p of picked) {
      const r = await tx.fieldTranslation.updateMany({
        where: { entityType: p.entity_type, entityId: p.entity_id, field: p.field, status: "pending" },
        data: { status: "running", startedAt: now },
      })
      if (r.count === 0) continue
      const row = await tx.fieldTranslation.findUnique({
        where: { entityType_entityId_field: { entityType: p.entity_type, entityId: p.entity_id, field: p.field } },
      })
      if (row) rows.push(row)
    }
    return rows
  })
}

/** Text of one language column of a row. */
function columnText(row: Pick<Row, "textJa" | "textId" | "textEn">, locale: TranslationLocale): string | null {
  return locale === "ja" ? row.textJa : locale === "id" ? row.textId : row.textEn
}

/** Languages still missing for the row, in fill order (JA ⇄ ID before English). */
export function missingTargets(row: Pick<Row, "sourceLocale" | "textJa" | "textId" | "textEn">): TranslationLocale[] {
  return targetsFor(row.sourceLocale as TranslationLocale).filter((l) => !columnText(row, l)?.trim())
}

/** Column patch that stores `text` as the `locale` side. */
function columnPatch(locale: TranslationLocale, text: string) {
  return locale === "ja" ? { textJa: text } : locale === "id" ? { textId: text } : { textEn: text }
}

/**
 * Translates ONE missing language per pass (short, preemptible model calls);
 * apply() puts the row back to pending while other languages are missing.
 */
/**
 * Rows translated (JA ⇄ ID) before English existed: done but without text_en.
 * Claimed like pending rows (running + claim time) so apply()'s guard works;
 * only used when no pending row is waiting, inside the backfill window.
 */
async function claimEnglishBackfill(limit: number): Promise<Row[]> {
  return prisma.$transaction(async (tx) => {
    const picked = await tx.$queryRaw<Array<{ entity_type: string; entity_id: string; field: string }>>`
      SELECT entity_type, entity_id, field
      FROM field_translation
      WHERE status = 'done' AND text_en IS NULL AND source_locale IN ('ja', 'id')
      ORDER BY priority DESC, updated_at DESC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `
    const rows: Row[] = []
    const now = new Date()
    for (const p of picked) {
      const r = await tx.fieldTranslation.updateMany({
        where: { entityType: p.entity_type, entityId: p.entity_id, field: p.field, status: "done", textEn: null },
        data: { status: "running", startedAt: now },
      })
      if (r.count === 0) continue
      const row = await tx.fieldTranslation.findUnique({
        where: { entityType_entityId_field: { entityType: p.entity_type, entityId: p.entity_id, field: p.field } },
      })
      if (row) rows.push(row)
    }
    return rows
  })
}

async function translateOne(row: Row): Promise<WorkerOutcome> {
  const source = row.sourceLocale as TranslationLocale
  const target = missingTargets(row)[0]
  const text = columnText(row, source)
  if (!text) return { kind: "failure", error: "source text missing" }
  // Nothing missing (e.g. re-queued twice): finish without a model call.
  if (!target) return { kind: "success", translated: "", model: row.model ?? "(complete)" }

  let ticket
  try {
    ticket = gate.beginBackground()
  } catch (err) {
    if (err instanceof GateBusy) return { kind: "preempted" }
    throw err
  }
  const t0 = Date.now()
  try {
    const terms = await findGlossaryForText(text, source, target)
    const signal = AbortSignal.any([ticket.signal, AbortSignal.timeout(HTTP_TIMEOUT_MS)])
    aiLog("XLATE_BG", `${row.entityType}/${row.field} ${source}→${target} ${text.length} chars, glossary ${terms.length}`)
    const r = await translateText(
      { text, sourceLocale: source, targetLocale: target, glossary: terms.map(({ term, translation }) => ({ term, translation })) },
      { signal, background: true }
    )
    if (!r.translated.trim()) return { kind: "failure", error: "empty translation" }
    if (terms.length > 0) void bumpGlossaryUsage(terms.map((t) => t.id)).catch(() => undefined)
    aiLog("XLATE_BG_DONE", `${row.entityType}/${row.field} → ${r.translated.length} chars in ${Date.now() - t0}ms, misses ${r.glossaryMisses.length}`)
    return { kind: "success", translated: r.translated, model: r.modelUsed }
  } catch (err) {
    if (ticket.preempted) {
      aiLog("XLATE_BG", `${row.entityType}/${row.field} preempted after ${Date.now() - t0}ms`)
      return { kind: "preempted" }
    }
    const message = err instanceof Error ? err.message : String(err)
    const isTimeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")
    return { kind: "failure", error: (isTimeout ? `timeout after ${HTTP_TIMEOUT_MS}ms` : message).slice(0, 500) }
  } finally {
    ticket.end()
  }
}

/**
 * Write the outcome back to the row THIS worker claimed. Conditional update
 * only — never an upsert: the row must still exist, still be `running` with
 * our claim timestamp, and still carry the source hash we translated.
 * count 0 means the row was purged (entity deleted), re-enqueued with new
 * text, reset as stale or re-claimed by another worker: the result is
 * discarded and nothing is (re)created. Returns true when the write landed.
 */
async function apply(row: Row, outcome: WorkerOutcome): Promise<boolean> {
  const missing = missingTargets(row)
  const target = missing[0]
  const filled = outcome.kind === "success" && !!target && !!outcome.translated
  // More languages to go: back to pending right away (same priority, attempts kept).
  const more = filled && missing.length > 1
  const next = more
    ? { status: "pending" as const, attempts: row.attempts, lastError: null, requestedAt: new Date(), translated: outcome.translated, model: outcome.model }
    : nextState({ attempts: row.attempts }, outcome)
  const now = new Date()
  const res = await prisma.fieldTranslation.updateMany({
    where: {
      entityType: row.entityType,
      entityId: row.entityId,
      field: row.field,
      status: "running",
      startedAt: row.startedAt,
      sourceHash: row.sourceHash,
    },
    data: {
      status: next.status,
      attempts: next.attempts,
      lastError: next.lastError,
      startedAt: null,
      ...(next.requestedAt ? { requestedAt: next.requestedAt } : {}),
      ...(filled && target && next.translated ? { ...columnPatch(target, next.translated), model: next.model ?? null } : {}),
      ...(next.status === "done" ? { translatedAt: now } : {}),
    },
  })
  if (res.count === 0) {
    aiLog("XLATE_BG_SKIP", `${row.entityType}/${row.entityId}/${row.field}: row gone or re-claimed, ${outcome.kind} discarded`)
    return false
  }
  if (outcome.kind === "failure") {
    aiLog("XLATE_BG_FAIL", `${row.entityType}/${row.entityId}/${row.field}: ${outcome.error}`)
  }
  return true
}
