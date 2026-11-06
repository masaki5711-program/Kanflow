/**
 * Backtest (plan 12 §5): finished projects in `closedAt` order; each is estimated only from projects that closed
 * and were finalized before ITS reference date (the first day of its start month — the backtest's R), then
 * compared with what actually happened. Internal evaluation: every source is visible, so the hidden-source paths are
 * NOT exercised here (unit tests cover them). Strata can hold a single project: anything shown to people other than
 * administrators must be banded and updated only per pair of new projects (plan 12 §10, final re-review MEDIUM).
 *
 * Metrics: leaf MAPE weighted by days (Σ|D − A| / ΣA) for the estimate and for the template alone, P80 hit rate
 * (A ≤ D80), mean absolute end-date error (estimate vs template), all also stratified by repository count.
 */
import { planBaseSchedule, type BaseSchedule, type BaseScheduleItem } from "@/lib/plan-schedule/base-schedule"
import { dayNumber, referenceDateOf } from "./dates"
import { estimatePlan } from "./plan"
import { ESTIMATE_METHOD_VERSION, type EstimateConfig, type Observation } from "./types"

export interface BacktestProject {
  projectId: string
  lineage: string
  projectType: string
  attributes: readonly string[]
  repoCount: number
  startDate: string
  closedAt: string
  finalizedAt: string
  /** The base schedule the project was loaded from (template days). */
  schedule: BaseSchedule
  /** Actual days per leaf key (leaves missing here are incomplete and neither learned from nor scored). */
  actualDays: Readonly<Record<string, number>>
  /** Optional per-leaf facts. */
  waitGapDays?: Readonly<Record<string, number>>
  loadObserved?: Readonly<Record<string, number>>
  /**
   * The project's observations as the estimate engine reads them in production (real actuals: through the use-time
   * confidentiality check). When given they replace the ones derived from `schedule` + `actualDays`.
   */
  observations?: readonly Observation[]
}

export interface ErrorTotals {
  leaves: number
  mapeEstimate: number
  mapeTemplate: number
  p80HitRate: number
}

export interface BacktestProjectResult extends ErrorTotals {
  projectId: string
  lineage: string
  repoCount: number
  /** Observations available at the project's R. */
  priorObservations: number
  endErrorEstimateDays: number
  endErrorTemplateDays: number
}

export interface BacktestReport {
  methodVersion: string
  projects: BacktestProjectResult[]
  overall: ErrorTotals & { endErrorEstimateDays: number; endErrorTemplateDays: number; mapeRatio: number }
  /** Same metrics per repository count (plan 12 §2.4: decide later whether the count enters matching). */
  byRepoCount: Record<string, ErrorTotals>
  byLineage: Record<string, ErrorTotals>
}

function leavesOf(items: readonly BaseScheduleItem[]): BaseScheduleItem[] {
  return items.flatMap((i) => ((i.children ?? []).length > 0 ? leavesOf(i.children ?? []) : [i]))
}

function withDays(items: readonly BaseScheduleItem[], days: Readonly<Record<string, number>>): BaseScheduleItem[] {
  return items.map((i) => ((i.children ?? []).length > 0 ? { ...i, children: withDays(i.children ?? [], days) } : i.milestone || days[i.key] === undefined ? { ...i } : { ...i, durationDays: days[i.key] }))
}

/** The observations a finished project contributes (complete, non-milestone leaves). */
export function observationsOf(p: BacktestProject): Observation[] {
  if (p.observations) return [...p.observations]
  return leavesOf(p.schedule.items).flatMap((leaf) => {
    const actual = p.actualDays[leaf.key]
    if (leaf.milestone || actual === undefined) return []
    return [
      {
        snapshotItemId: `${p.projectId}:${leaf.key}`,
        sourceProjectId: p.projectId,
        lineage: p.lineage,
        projectType: p.projectType,
        templateKey: leaf.key,
        name: leaf.name,
        attributes: p.attributes,
        plannedDays: leaf.durationDays ?? 1,
        actualDays: actual,
        closedAt: p.closedAt,
        finalizedAt: p.finalizedAt,
        waitGapDays: p.waitGapDays?.[leaf.key] ?? null,
        loadObserved: p.loadObserved?.[leaf.key] ?? null,
        repoTouched: p.repoCount,
      },
    ]
  })
}

interface Acc {
  leaves: number
  absEst: number
  absTpl: number
  actual: number
  hits: number
}
const emptyAcc = (): Acc => ({ leaves: 0, absEst: 0, absTpl: 0, actual: 0, hits: 0 })
const totals = (a: Acc): ErrorTotals => ({
  leaves: a.leaves,
  mapeEstimate: a.actual > 0 ? a.absEst / a.actual : 0,
  mapeTemplate: a.actual > 0 ? a.absTpl / a.actual : 0,
  p80HitRate: a.leaves > 0 ? a.hits / a.leaves : 0,
})
const add = (a: Acc, b: Acc): Acc => ({ leaves: a.leaves + b.leaves, absEst: a.absEst + b.absEst, absTpl: a.absTpl + b.absTpl, actual: a.actual + b.actual, hits: a.hits + b.hits })

/**
 * `pool`: further observations the engine may learn from but that are not scored (production estimates read the
 * lineage AND the project type, so a lineage's backtest learns from other lineages of the same type too). An
 * observation of a scored project is never taken twice.
 */
export function runBacktest(projects: readonly BacktestProject[], config?: Partial<EstimateConfig>, pool: readonly Observation[] = []): BacktestReport {
  const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0)
  const ordered = projects.toSorted((a, b) => cmp(a.closedAt, b.closedAt) || cmp(a.projectId, b.projectId))
  const scored = ordered.flatMap(observationsOf)
  const seen = new Set(scored.map((o) => o.snapshotItemId))
  const allObs = [...scored, ...pool.filter((o) => !seen.has(o.snapshotItemId))]
  const poolProjects = new Set(allObs.map((o) => o.sourceProjectId))
  const results: BacktestProjectResult[] = []
  let overall = emptyAcc()
  const byRepo = new Map<string, Acc>()
  const byLineage = new Map<string, Acc>()
  let endEst = 0
  let endTpl = 0
  let scoredProjects = 0

  for (const p of ordered) {
    const referenceDate = referenceDateOf(p.startDate)
    const others = allObs.filter((o) => o.sourceProjectId !== p.projectId)
    const estimate = estimatePlan(p.schedule, others, {
      lineage: p.lineage,
      projectType: p.projectType,
      attributes: p.attributes,
      referenceDate,
      visibleProjectIds: poolProjects,
      config,
    }, p.startDate)
    const acc = emptyAcc()
    const template = new Map(leavesOf(p.schedule.items).map((l) => [l.key, l]))
    for (const leaf of estimate.leaves) {
      const actual = p.actualDays[leaf.key]
      const tpl = template.get(leaf.key)
      if (actual === undefined || !tpl || tpl.milestone) continue
      acc.leaves++
      acc.absEst += Math.abs(leaf.d50 - actual)
      acc.absTpl += Math.abs(leaf.templateDays - actual)
      acc.actual += actual
      if (actual <= leaf.d80) acc.hits++
    }
    const actualEnd = planBaseSchedule({ ...p.schedule, items: withDays(p.schedule.items, p.actualDays) }, p.startDate).plannedEnd
    const errEst = Math.abs(dayNumber(estimate.p50End) - dayNumber(actualEnd))
    const errTpl = Math.abs(dayNumber(estimate.templateEnd) - dayNumber(actualEnd))
    // Averaged over the scored projects only, so the end-date error and the leaf errors describe the same n.
    if (acc.leaves > 0) {
      endEst += errEst
      endTpl += errTpl
      scoredProjects++
    }
    overall = add(overall, acc)
    byRepo.set(String(p.repoCount), add(byRepo.get(String(p.repoCount)) ?? emptyAcc(), acc))
    byLineage.set(p.lineage, add(byLineage.get(p.lineage) ?? emptyAcc(), acc))
    results.push({
      projectId: p.projectId,
      lineage: p.lineage,
      repoCount: p.repoCount,
      priorObservations: others.filter((o) => o.closedAt < referenceDate && o.finalizedAt < referenceDate).length,
      endErrorEstimateDays: errEst,
      endErrorTemplateDays: errTpl,
      ...totals(acc),
    })
  }
  const o = totals(overall)
  return {
    methodVersion: ESTIMATE_METHOD_VERSION,
    projects: results,
    overall: {
      ...o,
      mapeRatio: o.mapeTemplate > 0 ? o.mapeEstimate / o.mapeTemplate : 1,
      endErrorEstimateDays: scoredProjects > 0 ? endEst / scoredProjects : 0,
      endErrorTemplateDays: scoredProjects > 0 ? endTpl / scoredProjects : 0,
    },
    byRepoCount: Object.fromEntries([...byRepo].map(([k, a]) => [k, totals(a)])),
    byLineage: Object.fromEntries([...byLineage].map(([k, a]) => [k, totals(a)])),
  }
}
