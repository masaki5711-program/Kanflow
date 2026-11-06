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
import { runBacktest, ESTIMATE_METHOD_VERSION, type BacktestProject, type BacktestReport, type Observation } from "@/lib/plan-estimate"
import { baseScheduleSchema, keyAliases, planBaseSchedule, type BaseSchedule, type BaseScheduleItem } from "@/lib/plan-schedule/base-schedule"
import { tokyoDateKey } from "@/lib/plan-progress"
import { logger } from "@/lib/logger"
import { defaultDb, withTransaction, type Db } from "@/services/_shared/db"
import { ValidationError } from "@/services/_shared/errors"
import { notify } from "@/services/_shared/notifications"
import { learnableItemFacts, learnableItemIds, type LearnableFact } from "@/services/plan-actuals/actuals.learnable"
import { observationOf } from "@/services/plan-estimate-run/estimate-run.compute"
import { activeApproval, decideGate, lineageInputHash, type EvalRecord, type Gate } from "@/services/plan-estimate-run/gate"

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

/** Builds and runs the backtest of one lineage on the current, learnable snapshots. Reads only. */
export async function backtestLineage(lineage: string, db: Db = defaultDb, cache?: TypePoolCache): Promise<LineageBacktest> {
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
  const report = runBacktest(projects, undefined, pool)
  const scored = report.projects.filter((p) => p.leaves > 0).length
  for (const p of report.projects) if (p.leaves === 0) skips.push({ projectId: p.projectId, reason: "no_scored_leaf" })
  return { lineage, report, scored, skips, leavesWithoutTemplate, inputHash }
}

export function recordOf(b: LineageBacktest): EvalRecord {
  const o = b.report.overall
  return { n: b.scored, mape: o.mapeEstimate, mapeTemplate: o.mapeTemplate, p80Hit: o.p80HitRate, endErrorDays: o.endErrorEstimateDays, endErrorTemplateDays: o.endErrorTemplateDays }
}

export interface Recorded {
  lineage: string
  /** false: the snapshots changed while computing — nothing was written (the newer change records again). */
  written: boolean
  record: EvalRecord
  gate: Gate
  /** An active approval ended because the backtest no longer passes. */
  approvalEnded: boolean
  scored: number
  skipped: number
}

/**
 * Runs the backtest of a lineage and records it (one row per run; the gate reads the latest). Under a per-lineage
 * advisory lock: the row is written only if the snapshots are still the ones it was computed from; an active approval
 * of a record that no longer passes ends (reason "failed"), one of an older method ends (reason "method").
 */
export async function recordLineageBacktest(lineage: string, opts: { now?: Date; db?: Db; cache?: TypePoolCache } = {}): Promise<Recorded> {
  const now = opts.now ?? new Date()
  const result = await backtestLineage(lineage, opts.db ?? defaultDb, opts.cache)
  const record = recordOf(result)
  const gate = decideGate(record)
  const skipped = result.skips.length
  if (skipped > 0 || result.leavesWithoutTemplate > 0) {
    const reasons: Partial<Record<SkipReason, number>> = {}
    for (const s of result.skips) reasons[s.reason] = (reasons[s.reason] ?? 0) + 1
    const unusual = result.skips.filter((s) => s.reason !== "no_loaded_schedule")
    const fields = { lineage, scored: result.scored, skipped, reasons, leavesWithoutTemplate: result.leavesWithoutTemplate, projects: unusual.slice(0, 20).map((s) => `${s.projectId}:${s.reason}`) }
    if (unusual.length > 0 || result.leavesWithoutTemplate > 0) log.warn("backtest left projects or leaves out", fields)
    else log.info("backtest left projects without a loaded schedule out", fields)
  }
  const run = async (tx: Db): Promise<Recorded> => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`plan_estimate_eval:${lineage}`}))`
    if ((await lineageInputHash(lineage, tx)) !== result.inputHash) {
      log.info("backtest result discarded: the snapshots changed while computing", { lineage })
      return { lineage, written: false, record, gate, approvalEnded: false, scored: result.scored, skipped }
    }
    await tx.planEstimateEval.create({
      data: { lineage, evaluatedOn: new Date(`${tokyoDateKey(now)}T00:00:00.000Z`), methodVersion: ESTIMATE_METHOD_VERSION, ...record, skipped, inputHash: result.inputHash },
    })
    const approval = await activeApproval(lineage, tx)
    let approvalEnded = false
    if (approval && (approval.methodVersion !== ESTIMATE_METHOD_VERSION || !gate.on)) {
      const endReason = approval.methodVersion !== ESTIMATE_METHOD_VERSION ? "method" : "failed"
      await tx.planEstimateGateApproval.update({ where: { id: approval.id }, data: { endedAt: now, endReason } })
      approvalEnded = endReason === "failed"
      log.warn("estimate from actuals turned off for a lineage", { lineage, endReason, reason: gate.reason })
    }
    log.info("backtest recorded", { lineage, n: record.n, skipped, passes: gate.on, reason: gate.reason })
    return { lineage, written: true, record, gate, approvalEnded, scored: result.scored, skipped }
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
  chain = chain.then(async () => {
    const job = pending.get(lineage)
    pending.delete(lineage)
    if (job) await afterActualsChange(lineage, job.changes)
  })
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

export interface RecomputeResult {
  recorded: Recorded[]
  /** Lineages whose backtest failed (the rest were still computed). */
  failed: string[]
}

/** An administrator's "計算し直す": every current lineage, one after another, each on its own (no notifications). */
export async function recordAllLineages(opts: { now?: Date } = {}): Promise<RecomputeResult> {
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
