/**
 * The backtest on REAL actuals (plan 12 §5 "継続"): for one lineage, every finished project with a current snapshot is
 * estimated from the projects that closed and were finalized before its own reference date, exactly as a run would
 * (the lineage's AND the project types' actuals, through the use-time confidentiality check), and compared with
 * what happened. The result is one plan_estimate_eval row — what the per-lineage gate (plan-estimate-run/gate.ts)
 * reads.
 *
 * When: after every actuals finalize / learning switch (queued in this process, one lineage at a time, coalesced:
 * `enqueueAfterActualsChange`), and when an administrator asks (`recordAllLineages`). Recording is serialized per
 * lineage (advisory lock) and refuses a result computed from snapshots that changed meanwhile, so the latest row is
 * always of the newest data. The gate treats a row of older snapshots as outdated (fails closed), so a recompute that
 * is still queued or failed never keeps a stale "on".
 *
 * It is an INTERNAL evaluation: the numbers are shown to administrators only (unbanded; plan 12 §10). When an
 * approved lineage stops passing, its approval ends (it needs a new look to come back) and the PO / SM of the
 * projects whose change caused it are told — without numbers or reasons (the run card already says the gate is off).
 *
 * A project is scored when its snapshot came from a loaded schedule (plan_schedule_load): the loaded content is the
 * schedule, with each leaf's TEMPLATE days (the snapshot's templateDays) and without the levelled start constraints.
 * A leaf without template days (added by a lesson rule, or the key no longer maps) is not scored. Lesson rules are not
 * re-applied: the comparison is estimate vs template days.
 */
import { runBacktest, ESTIMATE_METHOD_VERSION, type BacktestProject, type BacktestReport, type EstimateConfig, type Observation } from "@/lib/plan-estimate"
import { baseScheduleSchema, keyAliases, planBaseSchedule, type BaseSchedule, type BaseScheduleItem } from "@/lib/plan-schedule/base-schedule"
import { tokyoDateKey } from "@/lib/plan-progress"
import { logger } from "@/lib/logger"
import { defaultDb, withTransaction, type Db } from "@/services/_shared/db"
import { ValidationError } from "@/services/_shared/errors"
import { notify } from "@/services/_shared/notifications"
import { learnableItemFacts, learnableItemIds, type LearnableFact } from "@/services/plan-actuals/actuals.learnable"
import { observationOf } from "@/services/plan-estimate-run/estimate-run.compute"
import { activeApproval, activeParamApproval, currentParams, decideGate, endInvalidParamApproval, latestEval, paramApprovalEndTime, lineageInputHash, lineageInputHashes, type EvalRecord, type Gate } from "@/services/plan-estimate-run/gate"

const log = logger.child({ module: "plan-estimate-eval" })

/** Lineages recomputed by one "all" request (far above a real portfolio; past it the request says so). */
export const LINEAGES_MAX = 500

export type SkipReason = "no_snapshot" | "no_loaded_schedule" | "schedule_unreadable" | "schedule_invalid" | "no_scored_leaf"

export interface LineageBacktest {
  lineage: string
  report: BacktestReport
  /** Finished projects scored (at least one leaf with an actual and template days). */
  scored: number
  /** Finished projects of the lineage that were not scored, with why (scored + skips = the lineage's projects). */
  skips: { projectId: string; reason: SkipReason }[]
  /** Leaves with an actual but no template days (not scored). */
  leavesWithoutTemplate: number
  /** lineageInputHash at the start of the computation. */
  inputHash: string
}

function mapLeaves(items: readonly BaseScheduleItem[], fn: (leaf: BaseScheduleItem) => BaseScheduleItem): BaseScheduleItem[] {
  return items.map((i) => ((i.children ?? []).length > 0 ? { ...i, children: mapLeaves(i.children ?? [], fn) } : fn(i)))
}

function leafKeys(items: readonly BaseScheduleItem[]): string[] {
  return items.flatMap((i) => ((i.children ?? []).length > 0 ? leafKeys(i.children ?? []) : i.milestone ? [] : [i.key]))
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10)
const errText = (err: unknown) => (err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300))

function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const r of rows) {
    const k = key(r)
    const list = out.get(k)
    if (list) list.push(r)
    else out.set(k, [r])
  }
  return out
}

/** Facts of one project type, read once per recompute of many lineages. */
export type TypePoolCache = Map<string, Promise<LearnableFact[]>>

/** Every observation of the lineage and of the project types its projects have (what a run of the lineage reads). */
async function poolFor(lineage: string, db: Db, cache?: TypePoolCache): Promise<LearnableFact[]> {
  const own = learnableItemFacts(await learnableItemIds({ lineage }, db), db)
  const types = await db.planActualsSnapshot.findMany({ where: { lineage, supersededAt: null, includeInLearning: true }, select: { projectType: true }, distinct: ["projectType"] })
  const typeFacts = types.map((t) => {
    const hit = cache?.get(t.projectType)
    if (hit) return hit
    const read = learnableItemIds({ projectType: t.projectType }, db).then((ids) => learnableItemFacts(ids, db))
    cache?.set(t.projectType, read)
    return read
  })
  const all = [...(await own), ...(await Promise.all(typeFacts)).flat()]
  const seen = new Set<string>()
  return all.filter((f) => (seen.has(f.snapshotItemId) ? false : (seen.add(f.snapshotItemId), true)))
}

/** What a lineage's backtest runs on: the scored projects, the learning pool, and what was left out (reads only). */
export interface BacktestInput {
  lineage: string
  projects: BacktestProject[]
  pool: Observation[]
  /** Projects left out before scoring (projects without a scored leaf are added by `scoreBacktest`). */
  skips: LineageBacktest["skips"]
  leavesWithoutTemplate: number
  inputHash: string
}

/** Builds the backtest input of one lineage from the current, learnable snapshots. Reads only. */
export async function backtestInput(lineage: string, db: Db = defaultDb, cache?: TypePoolCache): Promise<BacktestInput> {
  const inputHash = await lineageInputHash(lineage, db)
  const facts = await poolFor(lineage, db, cache)
  const factsByProject = groupBy(facts.filter((f) => f.lineage === lineage), (f) => f.sourceProjectId)
  const projectIds = [...factsByProject.keys()].sort()
  const snapshots = projectIds.length
    ? await db.planActualsSnapshot.findMany({
        where: { projectId: { in: projectIds }, supersededAt: null, includeInLearning: true, lineage },
        select: { id: true, projectId: true, projectType: true, scheduleLoadId: true, skipWeekends: true, repoCount: true, closedAt: true, firstFinalizedAt: true },
      })
    : []
  const loadIds = snapshots.flatMap((s) => (s.scheduleLoadId ? [s.scheduleLoadId] : []))
  const [loads, items] = await Promise.all([
    loadIds.length ? db.planScheduleLoad.findMany({ where: { id: { in: loadIds } }, select: { id: true, content: true, startDate: true } }) : [],
    snapshots.length ? db.planActualsItem.findMany({ where: { snapshotId: { in: snapshots.map((s) => s.id) }, templateKey: { not: null }, templateDays: { not: null } }, select: { snapshotId: true, templateKey: true, templateDays: true } }) : [],
  ])
  const loadById = new Map(loads.map((l) => [l.id, l]))
  const itemsBySnapshot = groupBy(items, (i) => i.snapshotId)
  const snapshotByProject = new Map(snapshots.map((s) => [s.projectId, s]))

  const projects: BacktestProject[] = []
  const skips: LineageBacktest["skips"] = []
  let leavesWithoutTemplate = 0
  for (const projectId of projectIds) {
    const s = snapshotByProject.get(projectId)
    if (!s) {
      skips.push({ projectId, reason: "no_snapshot" })
      continue
    }
    const load = s.scheduleLoadId ? loadById.get(s.scheduleLoadId) : undefined
    if (!load) {
      skips.push({ projectId, reason: "no_loaded_schedule" })
      continue
    }
    const parsed = baseScheduleSchema.safeParse(load.content)
    if (!parsed.success) {
      skips.push({ projectId, reason: "schedule_unreadable" })
      continue
    }
    const startDate = dayKey(load.startDate)
    let aliases: Map<string, string>
    try {
      aliases = keyAliases(parsed.data as BaseSchedule)
    } catch {
      skips.push({ projectId, reason: "schedule_invalid" })
      continue
    }
    // Template days per CURRENT key (a snapshot item recorded under a former key still maps).
    const templateDays = new Map<string, number>()
    for (const it of itemsBySnapshot.get(s.id) ?? []) {
      const key = aliases.get(it.templateKey as string)
      if (key !== undefined) templateDays.set(key, it.templateDays as number)
    }
    const schedule: BaseSchedule = {
      items: mapLeaves(parsed.data.items as BaseScheduleItem[], (leaf) => {
        const copy: BaseScheduleItem = { ...leaf }
        delete copy.notBeforeOffsetDays
        const days = templateDays.get(leaf.key)
        return days !== undefined && !leaf.milestone ? { ...copy, durationDays: days } : copy
      }),
      ...(s.skipWeekends ? { skipWeekends: true } : {}),
    }
    try {
      planBaseSchedule(schedule, startDate)
    } catch {
      // A stored schedule that no longer validates (rules tightened since) is left out, never guessed at.
      skips.push({ projectId, reason: "schedule_invalid" })
      continue
    }
    const own = factsByProject.get(projectId) ?? []
    const leaves = new Set(leafKeys(schedule.items))
    const actualDays: Record<string, number> = {}
    for (const f of own) {
      const key = f.templateKey ? aliases.get(f.templateKey) : undefined
      if (key === undefined || !leaves.has(key) || f.actualDays === null) continue
      // Scored only against real template days: a leaf without them would compare the estimate with edited days.
      if (!templateDays.has(key)) {
        leavesWithoutTemplate++
        continue
      }
      actualDays[key] = f.actualDays
    }
    if (Object.keys(actualDays).length === 0) {
      skips.push({ projectId, reason: "no_scored_leaf" })
      continue
    }
    projects.push({
      projectId,
      lineage,
      projectType: s.projectType,
      attributes: own[0]?.attributes ?? [],
      repoCount: s.repoCount,
      startDate,
      closedAt: dayKey(s.closedAt),
      finalizedAt: dayKey(s.firstFinalizedAt),
      schedule,
      actualDays,
      observations: own.map(observationOf),
    })
  }
  const pool: Observation[] = facts.map(observationOf)
  return { lineage, projects, pool, skips, leavesWithoutTemplate, inputHash }
}

/** Runs the backtest on a built input, with the given estimator settings (undefined = the defaults). Pure. */
export function scoreBacktest(input: BacktestInput, config?: Partial<EstimateConfig>): LineageBacktest {
  const report = runBacktest(input.projects, config, input.pool)
  const scored = report.projects.filter((p) => p.leaves > 0).length
  const skips = [...input.skips, ...report.projects.filter((p) => p.leaves === 0).map((p) => ({ projectId: p.projectId, reason: "no_scored_leaf" as const }))]
  return { lineage: input.lineage, report, scored, skips, leavesWithoutTemplate: input.leavesWithoutTemplate, inputHash: input.inputHash }
}

/** Builds and runs the backtest of one lineage on the current, learnable snapshots (default settings unless given). Reads only. */
export async function backtestLineage(lineage: string, db: Db = defaultDb, cache?: TypePoolCache, config?: Partial<EstimateConfig>): Promise<LineageBacktest> {
  return scoreBacktest(await backtestInput(lineage, db, cache), config)
}

export function recordOf(b: LineageBacktest): EvalRecord {
  const o = b.report.overall
  return { n: b.scored, mape: o.mapeEstimate, mapeTemplate: o.mapeTemplate, p80Hit: o.p80HitRate, endErrorDays: o.endErrorEstimateDays, endErrorTemplateDays: o.endErrorTemplateDays }
}

export interface Recorded {
  lineage: string
  /** false: the snapshots (or the active settings) changed while computing — nothing was written (the newer change records again). */
  written: boolean
  record: EvalRecord
  gate: Gate
  /** An active approval ended because the backtest no longer passes. */
  approvalEnded: boolean
  /**
   * The approved estimator settings ended: the backtest with them no longer passed (the row recorded is the defaults'),
   * or they were of an older method.
   */
  paramsEnded: "failed" | "method" | null
  scored: number
  skipped: number
}

function logSkips(result: LineageBacktest): void {
  const skipped = result.skips.length
  if (skipped === 0 && result.leavesWithoutTemplate === 0) return
  const reasons: Partial<Record<SkipReason, number>> = {}
  for (const s of result.skips) reasons[s.reason] = (reasons[s.reason] ?? 0) + 1
  const unusual = result.skips.filter((s) => s.reason !== "no_loaded_schedule")
  const fields = { lineage: result.lineage, scored: result.scored, skipped, reasons, leavesWithoutTemplate: result.leavesWithoutTemplate, projects: unusual.slice(0, 20).map((s) => `${s.projectId}:${s.reason}`) }
  if (unusual.length > 0 || result.leavesWithoutTemplate > 0) log.warn("backtest left projects or leaves out", fields)
  else log.info("backtest left projects without a loaded schedule out", fields)
}

/**
 * Runs the backtest of a lineage and records it (one row per run; the gate reads the latest). It runs with the
 * lineage's approved estimator settings when there are some; when the backtest with them no longer passes, the settings
 * end (reason "failed") and the row recorded is the defaults' — the lineage falls back to the defaults automatically
 * (settings of an older method end with reason "method"). Under a per-lineage advisory lock: the row is written only if
 * the snapshots and the active settings are still the ones it was computed with; an active approval of a record that no
 * longer passes ends (reason "failed"), one of an older method ends (reason "method").
 */
export async function recordLineageBacktest(lineage: string, opts: { now?: Date; db?: Db; cache?: TypePoolCache } = {}): Promise<Recorded> {
  const active = await activeParamApproval(lineage, opts.db ?? defaultDb)
  const params = currentParams(active)
  const input = await backtestInput(lineage, opts.db ?? defaultDb, opts.cache)
  const withParams = scoreBacktest(input, params ? { ...params.params } : undefined)
  // Approved settings that no longer pass: the defaults are what the lineage falls back to, so they are what is recorded.
  const fallback = params && !decideGate(recordOf(withParams)).on ? scoreBacktest(input) : null
  const result = fallback ?? withParams
  const record = recordOf(result)
  const gate = decideGate(record)
  const skipped = result.skips.length
  logSkips(result)
  const run = async (tx: Db): Promise<Recorded> => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`plan_estimate_eval:${lineage}`}))`
    // The time is taken AFTER the lock (the computation can take a while, and an approval may have been made meanwhile).
    const now = opts.now ?? new Date()
    const nothing = { lineage, written: false, record, gate, approvalEnded: false, paramsEnded: null, scored: result.scored, skipped }
    if ((await lineageInputHash(lineage, tx)) !== result.inputHash) {
      log.info("backtest result discarded: the snapshots changed while computing", { lineage })
      return nothing
    }
    // A stored approval outside the grid (never used: `active` is null for it) ends here, under the lock.
    await endInvalidParamApproval(lineage, tx, now)
    if ((await activeParamApproval(lineage, tx))?.id !== active?.id) {
      log.info("backtest result discarded: the estimator settings changed while computing", { lineage })
      return nothing
    }
    let paramsEnded: Recorded["paramsEnded"] = null
    if (active && (!params || fallback)) {
      paramsEnded = params ? "failed" : "method"
      const endedAt = await paramApprovalEndTime(lineage, active.approvedAt, now, tx)
      await tx.planEstimateParamApproval.update({ where: { id: active.id }, data: { endedAt, endReason: paramsEnded } })
      log.warn("approved estimator settings ended for a lineage; it uses the defaults", { lineage, endReason: paramsEnded, paramApprovalId: active.id })
    }
    await tx.planEstimateEval.create({
      data: { lineage, evaluatedOn: new Date(`${tokyoDateKey(now)}T00:00:00.000Z`), methodVersion: ESTIMATE_METHOD_VERSION, ...record, skipped, inputHash: result.inputHash, paramApprovalId: paramsEnded ? null : (params?.id ?? null) },
    })
    const approval = await activeApproval(lineage, tx)
    let approvalEnded = false
    if (approval && (approval.methodVersion !== ESTIMATE_METHOD_VERSION || !gate.on)) {
      const endReason = approval.methodVersion !== ESTIMATE_METHOD_VERSION ? "method" : "failed"
      // Never before the approval (the table's CHECK): an approval made just now ends a millisecond after it.
      const endedAt = new Date(Math.max(now.getTime(), approval.approvedAt.getTime() + 1))
      await tx.planEstimateGateApproval.update({ where: { id: approval.id }, data: { endedAt, endReason } })
      approvalEnded = endReason === "failed"
      log.warn("estimate from actuals turned off for a lineage", { lineage, endReason, reason: gate.reason })
    }
    log.info("backtest recorded", { lineage, n: record.n, skipped, passes: gate.on, reason: gate.reason, params: paramsEnded ? "defaults" : params ? "approved" : "defaults" })
    return { lineage, written: true, record, gate, approvalEnded, paramsEnded, scored: result.scored, skipped }
  }
  // The lock + check + insert only: the computation above holds no transaction.
  return opts.db ? run(opts.db) : withTransaction(run)
}

/** A readable name per lineage, or none. `publicOnly`: a private template's name is not given (notifications). */
export async function lineageNames(lineages: readonly string[], opts: { publicOnly?: boolean; db?: Db } = {}): Promise<Map<string, string>> {
  const db = opts.db ?? defaultDb
  const out = new Map<string, string>()
  const ids = [...new Set(lineages.flatMap((l) => (l.startsWith("template:") ? [l.slice("template:".length)] : [])))]
  const rows = ids.length ? await db.planTemplate.findMany({ where: { id: { in: ids }, deletedAt: null, ...(opts.publicOnly ? { visibility: "public" } : {}) }, select: { id: true, name: true } }) : []
  const byId = new Map(rows.map((r) => [r.id, r.name]))
  for (const l of lineages) {
    if (l.startsWith("template:")) {
      const name = byId.get(l.slice("template:".length))
      if (name) out.set(l, name)
    } else if (l.startsWith("name:") && l.length > "name:".length) {
      // The project's own schedule name (normalized) — the reader's own project gave it.
      out.set(l, l.slice("name:".length))
    }
  }
  return out
}

/**
 * After a change of these projects' actuals (outside their transactions): re-run the lineage's backtest and, when an
 * approved lineage stopped passing, tell the projects' PO / SM (no numbers, no reason). Best effort: a failure is
 * logged; the gate then sees an outdated record and keeps the template's durations until a recompute succeeds.
 */
export async function afterActualsChange(lineage: string, changes: ReadonlyMap<string, string | null>, opts: { now?: Date; db?: Db } = {}): Promise<Recorded | null> {
  const db = opts.db ?? defaultDb
  let recorded: Recorded
  try {
    recorded = await recordLineageBacktest(lineage, opts)
  } catch (err) {
    log.error("backtest after an actuals change failed; the gate treats the lineage as outdated until a recompute succeeds", { lineage, projects: [...changes.keys()].slice(0, 20), error: errText(err) })
    return null
  }
  if (!recorded.approvalEnded) return recorded
  try {
    const projectIds = [...changes.keys()]
    const holders = await db.projectMember.findMany({ where: { projectId: { in: projectIds }, role: { in: ["po", "sm"] } }, select: { projectId: true, userId: true } })
    const name = (await lineageNames([lineage], { publicOnly: true, db })).get(lineage) ?? null
    for (const projectId of projectIds) {
      await notify(db, {
        recipientIds: holders.filter((h) => h.projectId === projectId).map((h) => h.userId),
        type: "plan_estimate_worse",
        actorId: changes.get(projectId) ?? null,
        projectId,
        entityType: "plan_estimate_lineage",
        entityId: lineage.slice(0, 191),
        payload: { lineageName: name },
        dedupeKey: `plan_estimate_worse:${lineage}:${tokyoDateKey(opts.now ?? new Date())}`.slice(0, 191),
      })
    }
  } catch (err) {
    // The record and the ended approval are written; only the message is lost (the admin page shows the end).
    log.error("could not notify that estimates from actuals were turned off", { lineage, error: errText(err) })
  }
  return recorded
}

interface Pending {
  /** projectId → the actor who changed it. */
  changes: Map<string, string | null>
}

/** Lineages waiting for their backtest in this process; a run takes its entry, a later change queues a new one. */
const pending = new Map<string, Pending>()
let chain: Promise<unknown> = Promise.resolve()

/** Backtests running now in this process (queued runs, the daily catch-up, an administrator's recompute). */
let running = 0

/** Runs a backtest job counted as running, so the low-priority parameter search knows to wait. */
async function counted<T>(job: () => Promise<T>): Promise<T> {
  running++
  try {
    return await job()
  } finally {
    running--
  }
}

/**
 * A backtest is waiting or running in THIS process. The parameter search (params.service) runs only when this is
 * false and pauses between candidates as soon as it turns true: a finalize's backtest — what the gate waits for —
 * never queues behind a search.
 *
 * In-process only, on purpose: the backtests after a change of the actuals and the searches both run in the web
 * process (finalize, the learning switch, the admin's requests); the daily catch-up runs where the daily jobs run (the
 * web without a worker, as in production, or the worker). A search in one process does not see a backtest of the
 * other; that costs no correctness — the search is written only when the lineage's snapshots and settings are still
 * the ones it searched with (checked under the lineage's lock), and a backtest never waits for a search.
 */
export function backtestsBusy(): boolean {
  return pending.size > 0 || running > 0
}

function queueRun(lineage: string): void {
  chain = chain.then(() =>
    counted(async () => {
      const job = pending.get(lineage)
      pending.delete(lineage)
      if (job) await afterActualsChange(lineage, job.changes)
    }),
  )
}

/**
 * Queue the lineage's backtest after an actuals change (the finalize / switch response does not wait). Changes of the
 * same lineage before its run starts are coalesced into one run; runs go one at a time (the backtest is CPU work on
 * the web's event loop). Never throws.
 */
export function enqueueAfterActualsChange(projectId: string, lineage: string, actorId: string | null): void {
  const queued = pending.get(lineage)
  if (queued) {
    queued.changes.set(projectId, actorId)
    return
  }
  pending.set(lineage, { changes: new Map([[projectId, actorId]]) })
  queueRun(lineage)
}

/**
 * Queue a recompute of the lineage's backtest with no project change (the approved settings ended or changed): the
 * same coalesced, serialized path, no notification. Never throws.
 */
export function enqueueLineageRecompute(lineage: string): void {
  if (pending.has(lineage)) return
  pending.set(lineage, { changes: new Map() })
  queueRun(lineage)
}

/** Resolves when every queued backtest has run (tests and shutdown). */
export function settleQueuedBacktests(): Promise<void> {
  return chain.then(() => undefined)
}

/** Lineages with at least one current, learnable snapshot (sorted). Past LINEAGES_MAX it refuses: never a silent subset. */
export async function currentLineages(db: Db = defaultDb): Promise<string[]> {
  const rows = await db.planActualsSnapshot.findMany({ where: { supersededAt: null, includeInLearning: true }, select: { lineage: true }, distinct: ["lineage"], orderBy: { lineage: "asc" }, take: LINEAGES_MAX + 1 })
  if (rows.length > LINEAGES_MAX) throw new ValidationError(`系統が ${LINEAGES_MAX} を超えています`, { max: LINEAGES_MAX }, "PLAN_ESTIMATE_EVAL_TOO_MANY")
  return rows.map((r) => r.lineage)
}

/**
 * The daily catch-up (collab daily): every lineage with current actuals whose latest record is missing or not of its
 * current snapshots — a queued run lost on restart, one that failed, a project hard-deleted with its snapshots, or
 * actuals finalized before this feature existed, approved estimator settings that changed. Each lineage on its own; no
 * notifications.
 */
export async function recordOutdatedLineages(opts: { now?: Date } = {}): Promise<RecomputeResult> {
  return counted(() => catchUp(opts))
}

async function catchUp(opts: { now?: Date }): Promise<RecomputeResult> {
  const lineages = await currentLineages()
  const hashes = await lineageInputHashes(lineages)
  const latest = await Promise.all(lineages.map((l) => latestEval(l)))
  const params = await Promise.all(lineages.map(async (l) => currentParams(await activeParamApproval(l))))
  const out: RecomputeResult = { recorded: [], failed: [] }
  const cache: TypePoolCache = new Map()
  for (const [i, lineage] of lineages.entries()) {
    // Current = of the current snapshots AND of the active settings (approved settings of an older method count as none).
    if (latest[i]?.inputHash === hashes.get(lineage) && (latest[i]?.paramApprovalId ?? null) === (params[i]?.id ?? null)) continue
    try {
      out.recorded.push(await recordLineageBacktest(lineage, { ...opts, cache }))
    } catch (err) {
      out.failed.push(lineage)
      log.error("daily backtest catch-up of a lineage failed; the others go on", { lineage, error: errText(err) })
    }
  }
  return out
}

export interface RecomputeResult {
  recorded: Recorded[]
  /** Lineages whose backtest failed (the rest were still computed). */
  failed: string[]
}

/** An administrator's "計算し直す": every current lineage, one after another, each on its own (no notifications). */
export async function recordAllLineages(opts: { now?: Date } = {}): Promise<RecomputeResult> {
  return counted(() => recomputeAll(opts))
}

async function recomputeAll(opts: { now?: Date }): Promise<RecomputeResult> {
  const cache: TypePoolCache = new Map()
  const out: RecomputeResult = { recorded: [], failed: [] }
  for (const lineage of await currentLineages()) {
    try {
      out.recorded.push(await recordLineageBacktest(lineage, { ...opts, cache }))
    } catch (err) {
      out.failed.push(lineage)
      log.error("backtest of a lineage failed during a recompute; the others go on", { lineage, error: errText(err) })
    }
  }
  return out
}
