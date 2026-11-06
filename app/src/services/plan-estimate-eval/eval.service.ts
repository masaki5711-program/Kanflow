/**
 * The backtest on REAL actuals (plan 12 §5 "継続"): for one lineage, every finished project with a current snapshot is
 * estimated from the projects that closed and were finalized before its own reference date, exactly as a run would
 * (the lineage's AND the project type's actuals, through the use-time confidentiality check), and compared with
 * what happened. The result is one plan_estimate_eval row — what the per-lineage gate (plan-estimate-run/gate.ts)
 * reads.
 *
 * Runs after every actuals finalize / learning switch of the lineage and when an administrator asks for it. It is an
 * INTERNAL evaluation: the numbers are shown to administrators only (unbanded; plan 12 §10 — anyone else would need
 * bands and pairwise updates). A PO / SM learns only that the result got worse (no numbers), by a notification.
 *
 * A project is scored when its snapshot came from a loaded schedule (plan_schedule_load): the loaded content is the
 * schedule, with each leaf's TEMPLATE days (the snapshot's templateDays) and without the levelled start constraints —
 * the same input an estimate run starts from.
 */
import { runBacktest, ESTIMATE_METHOD_VERSION, type BacktestProject, type BacktestReport, type Observation } from "@/lib/plan-estimate"
import { baseScheduleSchema, keyAliases, planBaseSchedule, type BaseSchedule, type BaseScheduleItem } from "@/lib/plan-schedule/base-schedule"
import { tokyoDateKey } from "@/lib/plan-progress"
import { logger } from "@/lib/logger"
import { defaultDb, type Db } from "@/services/_shared/db"
import { ValidationError } from "@/services/_shared/errors"
import { notify } from "@/services/_shared/notifications"
import { learnableItemFacts, learnableItemIds, type LearnableFact } from "@/services/plan-actuals/actuals.learnable"
import { observationOf } from "@/services/plan-estimate-run/estimate-run.compute"
import { decideGate, latestEval, type EvalRecord, type Gate } from "@/services/plan-estimate-run/gate"

const log = logger.child({ module: "plan-estimate-eval" })

/** Lineages recomputed by one "all" request (far above a real portfolio; past it the request says so). */
export const LINEAGES_MAX = 500
/** A MAPE ratio (estimate / template) that rose by this much counts as worse even if the gate stays off. */
export const WORSE_RATIO_STEP = 0.1

export interface LineageBacktest {
  lineage: string
  report: BacktestReport
  /** Finished projects scored (at least one complete leaf with an actual). */
  scored: number
  /** Projects of the lineage that could not be scored (no loaded schedule, unreadable schedule, no complete leaf). */
  skipped: number
}

function mapLeaves(items: readonly BaseScheduleItem[], fn: (leaf: BaseScheduleItem) => BaseScheduleItem): BaseScheduleItem[] {
  return items.map((i) => ((i.children ?? []).length > 0 ? { ...i, children: mapLeaves(i.children ?? [], fn) } : fn(i)))
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10)

/** The schedule a run of this project would have started from: template days, no start constraints. */
function templateSchedule(content: unknown, skipWeekends: boolean, templateDays: ReadonlyMap<string, number>): BaseSchedule | null {
  const parsed = baseScheduleSchema.safeParse(content)
  if (!parsed.success) return null
  const items = mapLeaves(parsed.data.items as BaseScheduleItem[], (leaf) => {
    const copy: BaseScheduleItem = { ...leaf }
    delete copy.notBeforeOffsetDays
    const days = templateDays.get(leaf.key)
    return days !== undefined && !leaf.milestone ? { ...copy, durationDays: days } : copy
  })
  return { items, ...(skipWeekends ? { skipWeekends: true } : {}) }
}

/** Every observation of the lineage and of the project types its projects have (what a run of the lineage reads). */
async function poolFor(lineage: string, db: Db): Promise<LearnableFact[]> {
  const lineageIds = await learnableItemIds({ lineage }, db)
  const types = await db.planActualsSnapshot.findMany({ where: { lineage, supersededAt: null, includeInLearning: true }, select: { projectType: true }, distinct: ["projectType"] })
  const typeIds = (await Promise.all(types.map((t) => learnableItemIds({ projectType: t.projectType }, db)))).flat()
  return learnableItemFacts([...new Set([...lineageIds, ...typeIds])], db)
}

/** Builds and runs the backtest of one lineage on the current, learnable snapshots. Reads only. */
export async function backtestLineage(lineage: string, db: Db = defaultDb): Promise<LineageBacktest> {
  const facts = await poolFor(lineage, db)
  const mine = facts.filter((f) => f.lineage === lineage)
  const projectIds = [...new Set(mine.map((f) => f.sourceProjectId))].sort()
  const snapshots = projectIds.length
    ? await db.planActualsSnapshot.findMany({
        where: { projectId: { in: projectIds }, supersededAt: null, includeInLearning: true, lineage },
        select: { id: true, projectId: true, projectType: true, scheduleLoadId: true, skipWeekends: true, repoCount: true, closedAt: true, firstFinalizedAt: true },
      })
    : []
  const loadIds = snapshots.flatMap((s) => (s.scheduleLoadId ? [s.scheduleLoadId] : []))
  const [loads, items] = await Promise.all([
    loadIds.length ? db.planScheduleLoad.findMany({ where: { id: { in: loadIds } }, select: { id: true, content: true, startDate: true } }) : [],
    snapshots.length ? db.planActualsItem.findMany({ where: { snapshotId: { in: snapshots.map((s) => s.id) }, templateKey: { not: null } }, select: { snapshotId: true, templateKey: true, templateDays: true } }) : [],
  ])
  const loadById = new Map(loads.map((l) => [l.id, l]))
  const attributesBy = new Map(mine.map((f) => [f.sourceProjectId, f.attributes]))

  const projects: BacktestProject[] = []
  let skipped = projectIds.length - snapshots.length
  for (const s of snapshots) {
    const load = s.scheduleLoadId ? loadById.get(s.scheduleLoadId) : undefined
    const templateDays = new Map(items.filter((i) => i.snapshotId === s.id && i.templateKey && i.templateDays !== null).map((i) => [i.templateKey as string, i.templateDays as number]))
    const schedule = load ? templateSchedule(load.content, s.skipWeekends, templateDays) : null
    if (!load || !schedule) {
      skipped++
      continue
    }
    const startDate = dayKey(load.startDate)
    let aliases: Map<string, string>
    try {
      planBaseSchedule(schedule, startDate)
      aliases = keyAliases(schedule)
    } catch {
      // A stored schedule that no longer validates (rules tightened since) is left out, never guessed at.
      skipped++
      continue
    }
    const own = mine.filter((f) => f.sourceProjectId === s.projectId)
    const actualDays: Record<string, number> = {}
    for (const f of own) {
      const key = f.templateKey ? aliases.get(f.templateKey) : undefined
      if (key !== undefined && f.actualDays !== null) actualDays[key] = f.actualDays
    }
    if (Object.keys(actualDays).length === 0) {
      skipped++
      continue
    }
    projects.push({
      projectId: s.projectId,
      lineage,
      projectType: s.projectType,
      attributes: attributesBy.get(s.projectId) ?? [],
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
  return { lineage, report, scored: report.projects.filter((p) => p.leaves > 0).length, skipped }
}

export function recordOf(b: LineageBacktest): EvalRecord {
  const o = b.report.overall
  return { n: b.scored, mape: o.mapeEstimate, mapeTemplate: o.mapeTemplate, p80Hit: o.p80HitRate, endErrorDays: o.endErrorEstimateDays, endErrorTemplateDays: o.endErrorTemplateDays }
}

const ratio = (r: EvalRecord) => (r.mapeTemplate > 0 ? r.mape / r.mapeTemplate : 1)

/**
 * Worse (pure): the backtest passed and no longer does, or — both with enough projects — the estimate's error
 * relative to the template's rose by WORSE_RATIO_STEP or more.
 */
export function isWorse(previous: EvalRecord | null, next: EvalRecord): boolean {
  if (!previous) return false
  if (decideGate(previous).on && !decideGate(next).on) return true
  return previous.n >= 5 && next.n >= 5 && ratio(next) - ratio(previous) >= WORSE_RATIO_STEP
}

export interface Recorded {
  lineage: string
  record: EvalRecord
  gate: Gate
  worse: boolean
  scored: number
  skipped: number
}

/** Runs the backtest of a lineage and records it (one row per run; the gate reads the latest). */
export async function recordLineageBacktest(lineage: string, opts: { now?: Date; db?: Db } = {}): Promise<Recorded> {
  const db = opts.db ?? defaultDb
  const now = opts.now ?? new Date()
  const previous = await latestEval(lineage, db)
  const result = await backtestLineage(lineage, db)
  const record = recordOf(result)
  await db.planEstimateEval.create({
    data: { lineage, evaluatedOn: new Date(`${tokyoDateKey(now)}T00:00:00.000Z`), methodVersion: ESTIMATE_METHOD_VERSION, ...record },
  })
  const gate = decideGate(record)
  log.info("backtest recorded", { lineage, n: record.n, skipped: result.skipped, passes: gate.on, reason: gate.reason })
  return { lineage, record, gate, worse: isWorse(previous, record), scored: result.scored, skipped: result.skipped }
}

/**
 * After a finalize / learning switch of `projectId` (outside its transaction): re-run the lineage's backtest and, when
 * it got worse, tell the project's PO / SM (no numbers). Best effort — the finalize already succeeded and must not
 * fail because of this; a failure is logged and the next finalize or an administrator's request records again.
 */
export async function afterActualsChange(projectId: string, lineage: string, actorId: string | null, opts: { now?: Date; db?: Db } = {}): Promise<Recorded | null> {
  const db = opts.db ?? defaultDb
  try {
    const recorded = await recordLineageBacktest(lineage, opts)
    if (recorded.worse) {
      const holders = await db.projectMember.findMany({ where: { projectId, role: { in: ["po", "sm"] } }, select: { userId: true } })
      const name = (await lineageNames([lineage], db)).get(lineage) ?? null
      await notify(db, {
        recipientIds: holders.map((h) => h.userId),
        type: "plan_estimate_worse",
        actorId,
        projectId,
        entityType: "plan_estimate_lineage",
        entityId: lineage.slice(0, 191),
        payload: { lineage, lineageName: name, reason: recorded.gate.reason },
        dedupeKey: `plan_estimate_worse:${lineage}:${tokyoDateKey(opts.now ?? new Date())}`.slice(0, 191),
      })
    }
    return recorded
  } catch (err) {
    log.error("backtest after an actuals change failed; the gate keeps the previous record", { projectId, lineage, error: err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300) })
    return null
  }
}

/** A readable name per lineage: the template's name for "template:<id>" (when it still exists), else none. */
export async function lineageNames(lineages: readonly string[], db: Db = defaultDb): Promise<Map<string, string>> {
  const ids = [...new Set(lineages.flatMap((l) => (l.startsWith("template:") ? [l.slice("template:".length)] : [])))]
  if (ids.length === 0) return new Map()
  const rows = await db.planTemplate.findMany({ where: { id: { in: ids }, deletedAt: null }, select: { id: true, name: true } })
  const byId = new Map(rows.map((r) => [r.id, r.name]))
  return new Map(lineages.flatMap((l): [string, string][] => {
    const name = l.startsWith("template:") ? byId.get(l.slice("template:".length)) : undefined
    return name ? [[l, name]] : []
  }))
}

/** Lineages with at least one current, learnable snapshot (sorted). Past LINEAGES_MAX it refuses: never a silent subset. */
export async function currentLineages(db: Db = defaultDb): Promise<string[]> {
  const rows = await db.planActualsSnapshot.findMany({ where: { supersededAt: null, includeInLearning: true }, select: { lineage: true }, distinct: ["lineage"], orderBy: { lineage: "asc" }, take: LINEAGES_MAX + 1 })
  if (rows.length > LINEAGES_MAX) throw new ValidationError(`系統が ${LINEAGES_MAX} を超えています`, { max: LINEAGES_MAX }, "PLAN_ESTIMATE_EVAL_TOO_MANY")
  return rows.map((r) => r.lineage)
}

/** An administrator's "計算し直す": every current lineage, one after another (no notifications). */
export async function recordAllLineages(opts: { now?: Date; db?: Db } = {}): Promise<Recorded[]> {
  const db = opts.db ?? defaultDb
  const out: Recorded[] = []
  for (const lineage of await currentLineages(db)) out.push(await recordLineageBacktest(lineage, { ...opts, db }))
  return out
}
