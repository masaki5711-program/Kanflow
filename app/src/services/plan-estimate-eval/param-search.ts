/**
 * The deterministic parameter search (handoff 2026-11-05 "次の案" (2)): for one lineage, a small, fixed grid of the
 * estimator's tunable settings around today's defaults is evaluated with the SAME backtest and the SAME metrics the gate
 * reads (runBacktest: leaf MAPE weighted by days, P80 hit rate, end-date error). The result is a PROPOSAL that an
 * administrator approves or rejects; nothing here decides on its own and no LLM is involved.
 *
 * Pure (no database): same projects + pool → same result. The only non-deterministic input is the clock of the time
 * budget, and a search that runs out of time proposes nothing (a partial grid would depend on the machine's speed).
 *
 * Guarding against overfitting:
 * - at least GATE_MIN_PROJECTS scored projects (the gate's own threshold);
 * - the scored projects are split by close date: the latest third is the HOLD-OUT, never used to choose; the rest
 *   ranks the candidates;
 * - a candidate replaces the default only when its MAPE on the ranking part is better by SEARCH_MARGIN (or it brings
 *   the P80 hit rate into the gate's range where the default does not, without a worse MAPE);
 * - it must not be worse than the default on the hold-out, and its full backtest must pass the gate.
 *
 * What is searched (read from EstimateConfig; nothing new is invented): the outlier threshold in MADs, the recency
 * half-life, the shrinkage constant K and the prior P50→P80 spread S0. Not searched, with why:
 * - minHiddenSources — a privacy floor, never a tuning knob (resolveConfig only lets it rise);
 * - ratioMin / ratioMax — safety bounds of a proposal, tied to the 0.1 rounding of hidden-influenced ratios;
 * - madFloor, typePriorK, stage1Enough, stage3/4MinSimilarity — they change which observations match or how the type
 *   trend is formed; with a handful of projects per lineage the grid would mostly fit noise (kept for a later step);
 * - defaultParallelCap / maxParallelCap / maxDays — not measured by the backtest (levelling and limits).
 */
import { runBacktest, type BacktestProject, type BacktestReport, type Observation } from "@/lib/plan-estimate"
import { DEFAULT_PARAMS, PARAM_GRID, TUNED_KEYS, type TunedKey, type TunedParams } from "@/lib/plan-estimate/params"
export { DEFAULT_PARAMS, PARAM_GRID, TUNED_KEYS, isGridParams, type TunedKey, type TunedParams } from "@/lib/plan-estimate/params"
import { decideGate, GATE_MIN_PROJECTS, GATE_P80_RANGE, type EvalRecord } from "@/services/plan-estimate-run/gate"

/** A candidate must beat the default's MAPE on the ranking part by this fraction (0.05 = 5 % smaller). */
export const SEARCH_MARGIN = 0.05
/** Never more candidates than this per lineage, whatever the grid says. */
export const SEARCH_MAX_CANDIDATES = 100
/** Time budget of one lineage's search. Past it the search proposes nothing (says so) — never a partial grid. */
export const SEARCH_BUDGET_MS = 60_000

export type KeepReason = "not_enough_actuals" | "no_improvement" | "holdout_worse" | "not_passing" | "time_budget"

/** Aggregates of a set of scored projects (no project ids: what an administrator sees). */
export interface SubsetMetrics {
  projects: number
  leaves: number
  mape: number
  mapeTemplate: number
  p80Hit: number
  endErrorDays: number
  endErrorTemplateDays: number
}

export interface CandidateMetrics {
  /** The gate's record of the whole backtest. */
  full: EvalRecord
  /** The earlier projects: they rank the candidates. */
  search: SubsetMetrics
  /** The latest projects: only checked, never used to choose. */
  holdout: SubsetMetrics
}

export interface ParamSearchResult {
  outcome: "propose" | "keep_default"
  reason: KeepReason | null
  /** The proposed settings (the defaults when nothing is proposed). */
  params: TunedParams
  /** The defaults' metrics (null when there were too few projects to search). */
  before: CandidateMetrics | null
  /** The best candidate's metrics (null when none was ranked). */
  after: CandidateMetrics | null
  /** Candidates in the grid and how many were evaluated. */
  candidates: number
  evaluated: number
  timedOut: boolean
}

/** The candidates: the defaults first, then the rest of the grid in a fixed (lexicographic) order. */
export function gridCandidates(grid: Readonly<Record<TunedKey, readonly number[]>> = PARAM_GRID): TunedParams[] {
  let out: Record<TunedKey, number>[] = [{} as Record<TunedKey, number>]
  for (const k of TUNED_KEYS) out = out.flatMap((partial) => grid[k].map((v) => ({ ...partial, [k]: v })))
  const isDefault = (p: TunedParams) => TUNED_KEYS.every((k) => p[k] === DEFAULT_PARAMS[k])
  const rest = out.filter((p) => !isDefault(p))
  if (rest.length + 1 > SEARCH_MAX_CANDIDATES) throw new RangeError(`the parameter grid has ${rest.length + 1} candidates (max ${SEARCH_MAX_CANDIDATES})`)
  return [DEFAULT_PARAMS, ...rest]
}

const changedKeys = (p: TunedParams) => TUNED_KEYS.filter((k) => p[k] !== DEFAULT_PARAMS[k]).length

function subset(results: BacktestReport["projects"]): SubsetMetrics {
  let actual = 0
  let absEst = 0
  let absTpl = 0
  let hits = 0
  let leaves = 0
  let endEst = 0
  let endTpl = 0
  for (const p of results) {
    actual += p.actualDaysTotal
    absEst += p.absErrorEstimate
    absTpl += p.absErrorTemplate
    hits += p.p80Hits
    leaves += p.leaves
    endEst += p.endErrorEstimateDays
    endTpl += p.endErrorTemplateDays
  }
  const n = results.length
  return {
    projects: n,
    leaves,
    mape: actual > 0 ? absEst / actual : 0,
    mapeTemplate: actual > 0 ? absTpl / actual : 0,
    p80Hit: leaves > 0 ? hits / leaves : 0,
    endErrorDays: n > 0 ? endEst / n : 0,
    endErrorTemplateDays: n > 0 ? endTpl / n : 0,
  }
}

/** Projects in the latest third (rounded up) of the scored ones form the hold-out. */
export const holdoutSize = (scored: number) => Math.ceil(scored / 3)

/** Metrics of one backtest report, split by close date (the report keeps runBacktest's closedAt order). */
export function metricsOf(report: BacktestReport): CandidateMetrics {
  const scored = report.projects.filter((p) => p.leaves > 0)
  const cut = scored.length - holdoutSize(scored.length)
  const all = subset(scored)
  return {
    full: { n: scored.length, mape: all.mape, mapeTemplate: all.mapeTemplate, p80Hit: all.p80Hit, endErrorDays: all.endErrorDays, endErrorTemplateDays: all.endErrorTemplateDays },
    search: subset(scored.slice(0, cut)),
    holdout: subset(scored.slice(cut)),
  }
}

const p80InRange = (m: SubsetMetrics) => m.p80Hit >= GATE_P80_RANGE[0] && m.p80Hit <= GATE_P80_RANGE[1]

export interface SearchInput {
  projects: readonly BacktestProject[]
  pool: readonly Observation[]
}

export interface SearchOptions {
  /** Milliseconds; default SEARCH_BUDGET_MS. */
  budgetMs?: number
  /** Monotonic clock in ms (tests inject one). */
  clock?: () => number
  /** Called between candidates so the web's event loop can serve requests (default: setImmediate). */
  yieldControl?: () => Promise<void>
  grid?: Readonly<Record<TunedKey, readonly number[]>>
}

const defaultYield = () => new Promise<void>((resolve) => setImmediate(resolve))

/** Runs the search on one lineage's backtest input. See the module comment for the rules. */
export async function searchParams(input: SearchInput, opts: SearchOptions = {}): Promise<ParamSearchResult> {
  const candidates = gridCandidates(opts.grid)
  const keep = (reason: KeepReason, extra: Partial<ParamSearchResult> = {}): ParamSearchResult => ({
    outcome: "keep_default",
    reason,
    params: DEFAULT_PARAMS,
    before: null,
    after: null,
    candidates: candidates.length,
    evaluated: 0,
    timedOut: false,
    ...extra,
  })
  const clock = opts.clock ?? (() => performance.now())
  const budget = opts.budgetMs ?? SEARCH_BUDGET_MS
  const yieldControl = opts.yieldControl ?? defaultYield
  const started = clock()

  const run = (p: TunedParams) => metricsOf(runBacktest(input.projects, { ...p }, input.pool))
  const before = run(DEFAULT_PARAMS)
  if (before.full.n < GATE_MIN_PROJECTS) return keep("not_enough_actuals", { evaluated: 1 })

  const evaluated: { params: TunedParams; metrics: CandidateMetrics; index: number }[] = [{ params: DEFAULT_PARAMS, metrics: before, index: 0 }]
  for (const [index, params] of candidates.entries()) {
    if (index === 0) continue
    await yieldControl()
    if (clock() - started > budget) return keep("time_budget", { before, evaluated: evaluated.length, timedOut: true })
    evaluated.push({ params, metrics: run(params), index })
  }

  // Rank on the earlier projects only: P80 in the gate's range first, then the smaller MAPE, then the fewer changed
  // settings, then the grid order (a total order: the same input always gives the same choice).
  const ranked = evaluated.toSorted((a, b) => {
    const ea = p80InRange(a.metrics.search) ? 0 : 1
    const eb = p80InRange(b.metrics.search) ? 0 : 1
    return ea - eb || a.metrics.search.mape - b.metrics.search.mape || changedKeys(a.params) - changedKeys(b.params) || a.index - b.index
  })
  const best = ranked[0]
  const base = { before, after: best.metrics, evaluated: evaluated.length }
  if (best.index === 0) return keep("no_improvement", base)

  const def = before.search
  const cand = best.metrics.search
  const fixesP80 = p80InRange(cand) && !p80InRange(def) && cand.mape <= def.mape
  const clearlyBetter = cand.mape <= (1 - SEARCH_MARGIN) * def.mape
  if (!fixesP80 && !clearlyBetter) return keep("no_improvement", base)
  if (best.metrics.holdout.mape > before.holdout.mape) return keep("holdout_worse", base)
  if (!decideGate(best.metrics.full).on) return keep("not_passing", base)
  return { outcome: "propose", reason: null, params: best.params, ...base, candidates: candidates.length, timedOut: false }
}
