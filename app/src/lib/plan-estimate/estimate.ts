/**
 * Duration estimate of one leaf (plan 12 §3.2, §3.3): log-ratio statistics of matched observations, outliers
 * dropped by MAD, shrunk toward the project-type trend μ0 by α = n / (n + K), P50 and P80 ratios clamped, and
 * — when a hidden source took effect — ratios rounded to 0.1 with the days computed from the ROUNDED ratios.
 * Also the learned wait (lag), load (ℓ̂) and the per-person parallel cap (m_u), all with the hidden-source rules.
 */
import { hiddenAggregate, type HiddenAggregate, type HiddenPoint } from "./hidden"
import { matchLeaf, recency, usableAt, type MatchedObservation } from "./match"
import { ceilDays, clamp, effectiveN, roundTenth, weightedMedian, weightedQuantile, type Weighted } from "./stats"
import { ESTIMATE_DEFAULTS, type EstimateConfig, type EstimateContext, type EstimateLeaf, type HiddenState, type LeafEstimate, type Observation, type SourceRef, type TypePrior } from "./types"

export function resolveConfig(partial?: Partial<EstimateConfig>): EstimateConfig {
  return { ...ESTIMATE_DEFAULTS, ...partial }
}

/** Collects the hidden aggregates a run used, so E5 can persist them as the next run's `previousHidden`. */
export type HiddenStateSink = Map<string, HiddenState>

function aggregate(unit: string, points: readonly HiddenPoint[], cfg: EstimateConfig, ctx: EstimateContext, sink?: HiddenStateSink): HiddenAggregate | null {
  const agg = hiddenAggregate(points, cfg, ctx.previousHidden?.get(unit))
  if (agg && sink) sink.set(unit, agg.state)
  return agg
}

const hiddenPoints = (ms: readonly MatchedObservation[], value: (m: MatchedObservation) => number | null | undefined): HiddenPoint[] =>
  ms.flatMap((m) => {
    const x = value(m)
    return x === null || x === undefined || !Number.isFinite(x) ? [] : [{ projectId: m.obs.sourceProjectId, orderAt: m.obs.finalizedAt, x, w: m.weight }]
  })

/**
 * μ0 (plan 12 §3.3): the weighted median of the log ratios of every usable observation of the same project type
 * (visible ones, plus one hidden pseudo-observation under the hidden-source rules), shrunk by N / (N + 10).
 */
export function typePrior(observations: readonly Observation[], ctx: EstimateContext, sink?: HiddenStateSink): TypePrior {
  const cfg = resolveConfig(ctx.config)
  const same = usableAt(observations, ctx.referenceDate).filter((o) => o.projectType === ctx.projectType)
  const visible: Weighted[] = []
  const hidden: HiddenPoint[] = []
  for (const o of same) {
    const x = Math.log(o.actualDays / o.plannedDays)
    const w = recency(o.closedAt, ctx.referenceDate, cfg.halfLifeDays)
    if (ctx.visibleProjectIds.has(o.sourceProjectId)) visible.push({ x, w })
    else hidden.push({ projectId: o.sourceProjectId, orderAt: o.finalizedAt, x, w })
  }
  const hid = aggregate(`type:${ctx.projectType}`, hidden, cfg, ctx, sink)
  const pool = hid ? [...visible, { x: hid.x, w: hid.w }] : visible
  if (pool.length === 0) return { mu0: 0, n: 0, hiddenInfluenced: false, hiddenSourceProjectIds: [] }
  const n = visible.length + (hid ? hid.hPrime - 2 : 0)
  return { mu0: (n / (n + cfg.typePriorK)) * weightedMedian(pool), n, hiddenInfluenced: hid !== null, hiddenSourceProjectIds: hid?.projectIds ?? [] }
}

const toRef = (m: MatchedObservation): SourceRef => ({
  snapshotItemId: m.obs.snapshotItemId,
  sourceProjectId: m.obs.sourceProjectId,
  stage: m.stage,
  similarity: m.similarity,
  weight: m.weight,
  logRatio: m.x,
})

/** Weighted median of a metric over visible observations + its hidden aggregate, shrunk by its own n. */
function shrunkMetric(unit: string, visible: readonly MatchedObservation[], hiddenMs: readonly MatchedObservation[], value: (m: MatchedObservation) => number | null | undefined, toward: number, cfg: EstimateConfig, ctx: EstimateContext, sink?: HiddenStateSink): { value: number; hidden: boolean; ids: string[] } | null {
  const pts: Weighted[] = visible.flatMap((m) => {
    const x = value(m)
    return x === null || x === undefined || !Number.isFinite(x) ? [] : [{ x, w: m.weight }]
  })
  const hid = aggregate(unit, hiddenPoints(hiddenMs, value), cfg, ctx, sink)
  const pool = hid ? [...pts, { x: hid.x, w: hid.w }] : pts
  if (pool.length === 0) return null
  const n = effectiveN(pts.map((p) => p.w)) + (hid ? hid.hPrime - 2 : 0)
  const alpha = n / (n + cfg.shrinkK)
  return { value: alpha * weightedMedian(pool) + (1 - alpha) * toward, hidden: hid !== null, ids: hid?.projectIds ?? [] }
}

/** Estimate one leaf. `prior` is the run's `typePrior` (computed once per run). */
export function estimateLeaf(leaf: EstimateLeaf, observations: readonly Observation[], ctx: EstimateContext, prior: TypePrior, sink?: HiddenStateSink): LeafEstimate {
  const cfg = resolveConfig(ctx.config)
  const T = clamp(Math.round(leaf.templateDays), 1, cfg.maxDays)
  const templateLoad = leaf.load ?? 1
  if (leaf.milestone) {
    return { key: leaf.key, templateDays: T, d50: 1, d80: 1, r50: 1, r80: 1, n: 0, alpha: 0, hiddenInfluenced: false, typePriorOnly: false, kept: [], dropped: [], hiddenSourceProjectIds: [], lagDays: 0, load: templateLoad, mrSet: { leadTimeP50Hours: null, repoTouchedP50: null } }
  }

  const matched = matchLeaf(leaf, usableAt(observations, ctx.referenceDate), ctx, cfg)
  const V = matched.filter((m) => m.visible)
  const Hm = matched.filter((m) => !m.visible)
  const hid = aggregate(`ratio:${leaf.key}`, hiddenPoints(Hm, (m) => m.x), cfg, ctx, sink)

  let kept: MatchedObservation[] = []
  let dropped: MatchedObservation[] = []
  let mStar = 0
  let n = 0
  let s80: number | null = null
  if (V.length > 0 || hid) {
    const m = V.length > 0 ? weightedMedian(V.map((v) => ({ x: v.x, w: v.weight }))) : (hid as HiddenAggregate).x
    const mad = V.length > 0 ? Math.max(weightedMedian(V.map((v) => ({ x: Math.abs(v.x - m), w: v.weight }))), cfg.madFloor) : cfg.madFloor
    const limit = cfg.outlierMads * 1.4826 * mad
    kept = V.filter((v) => Math.abs(v.x - m) <= limit)
    dropped = V.filter((v) => Math.abs(v.x - m) > limit)
    const pool: Weighted[] = [...kept.map((k) => ({ x: k.x, w: k.weight })), ...(hid ? [{ x: hid.x, w: hid.w }] : [])]
    mStar = weightedMedian(pool)
    n = effectiveN(kept.map((k) => k.weight)) + (hid ? hid.hPrime - 2 : 0)
    if (n >= 3) s80 = weightedQuantile(pool, 0.8) - mStar
  }

  const alpha = n / (n + cfg.shrinkK)
  const xHat = alpha * mStar + (1 - alpha) * prior.mu0
  const sHat = alpha * Math.max(s80 ?? cfg.spreadPrior, 0) + (1 - alpha) * cfg.spreadPrior
  const hiddenInfluenced = hid !== null || (prior.hiddenInfluenced && alpha < 1)
  let r50 = clamp(Math.exp(xHat), cfg.ratioMin, cfg.ratioMax)
  let r80 = clamp(Math.exp(xHat + sHat), cfg.ratioMin, cfg.ratioMax)
  if (hiddenInfluenced) {
    // Days are computed ONLY from the rounded ratios: an exact ratio must not be recoverable as days ÷ T.
    r50 = clamp(roundTenth(r50), cfg.ratioMin, cfg.ratioMax)
    r80 = clamp(roundTenth(r80), r50, cfg.ratioMax)
  }
  const d50 = clamp(ceilDays(T * r50), 1, cfg.maxDays)
  const d80 = clamp(ceilDays(T * r80), d50, cfg.maxDays)

  const pool = [...kept]
  const lag = shrunkMetric(`lag:${leaf.key}`, pool, Hm, (m) => m.obs.waitGapDays, 0, cfg, ctx, sink)
  const lagDays = lag && lag.value >= 1 ? Math.round(lag.value) : 0

  let load = templateLoad
  if (templateLoad > 0) {
    const learned = shrunkMetric(`load:${leaf.key}`, pool, Hm, (m) => m.obs.loadObserved, templateLoad, cfg, ctx, sink)
    if (learned) load = clamp(learned.hidden ? roundTenth(learned.value) : Math.round(learned.value * 100) / 100, 0, 1)
  }

  const visibleMedian = (value: (m: MatchedObservation) => number | null | undefined): number | null => {
    const pts = kept.flatMap((k) => {
      const v = value(k)
      return v === null || v === undefined ? [] : [{ x: v, w: k.weight }]
    })
    return pts.length > 0 ? weightedMedian(pts) : null
  }

  const hiddenIds = new Set<string>([...(hid?.projectIds ?? []), ...(hiddenInfluenced && hid === null ? prior.hiddenSourceProjectIds : [])])
  return {
    key: leaf.key,
    templateDays: T,
    d50,
    d80,
    r50,
    r80,
    n,
    alpha,
    hiddenInfluenced,
    typePriorOnly: matched.length === 0 && prior.n > 0,
    kept: kept.map(toRef),
    dropped: dropped.map(toRef),
    hiddenSourceProjectIds: [...hiddenIds].toSorted(),
    lagDays,
    load,
    mrSet: { leadTimeP50Hours: visibleMedian((m) => m.obs.mrSetLeadTimeHours), repoTouchedP50: visibleMedian((m) => m.obs.repoTouched) },
  }
}

/** One person's peak of concurrently owned leaves in one finished project (plan 12 §3.5 m_u). */
export interface ParallelPeak {
  projectId: string
  /** First finalization of the project. */
  finalizedAt: string
  closedAt: string
  peak: number
}

/**
 * m_u: the 80th percentile of the person's past peaks, shrunk toward the default (2) by K, rounded, within
 * 1..maxParallelCap. Peaks from projects the requester cannot view follow the hidden-source rules.
 */
export function learnParallelCap(userKey: string, peaks: readonly ParallelPeak[], ctx: EstimateContext, sink?: HiddenStateSink): { cap: number; hiddenInfluenced: boolean } {
  const cfg = resolveConfig(ctx.config)
  const r = ctx.referenceDate
  const usable = peaks.filter((p) => p.closedAt < r && p.finalizedAt < r && p.peak > 0)
  const visible: Weighted[] = []
  const hidden: HiddenPoint[] = []
  for (const p of usable) {
    const w = recency(p.closedAt, r, cfg.halfLifeDays)
    if (ctx.visibleProjectIds.has(p.projectId)) visible.push({ x: p.peak, w })
    else hidden.push({ projectId: p.projectId, orderAt: p.finalizedAt, x: p.peak, w })
  }
  const hid = aggregate(`parallel:${userKey}`, hidden, cfg, ctx, sink)
  const pool = hid ? [...visible, { x: hid.x, w: hid.w }] : visible
  if (pool.length === 0) return { cap: cfg.defaultParallelCap, hiddenInfluenced: false }
  const n = effectiveN(visible.map((v) => v.w)) + (hid ? hid.hPrime - 2 : 0)
  const alpha = n / (n + cfg.shrinkK)
  const value = alpha * weightedQuantile(pool, 0.8) + (1 - alpha) * cfg.defaultParallelCap
  return { cap: clamp(Math.round(value), 1, cfg.maxParallelCap), hiddenInfluenced: hid !== null }
}
