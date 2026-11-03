/**
 * Types and defaults of the estimate engine (plan 12 E2, §3.1–§3.3). The engine is pure: callers (E1 / E5) turn
 * snapshot rows into `Observation`s AFTER the use-time confidentiality check (`learnableItemFacts`) and pass the
 * set of projects the requesting user can view. Nothing here reads the database.
 */

/** Method version stored with every run and backtest record; bump it when a formula or default changes. */
export const ESTIMATE_METHOD_VERSION = "e2-v1"

export interface EstimateConfig {
  /** Shrinkage constant K: α = n / (n + K). */
  shrinkK: number
  /** Half-life H of an observation's weight, in days. */
  halfLifeDays: number
  ratioMin: number
  ratioMax: number
  /** Outliers: |x − m| > outlierMads × 1.4826 × MAD. */
  outlierMads: number
  /** Lower bound of the MAD of log ratios. */
  madFloor: number
  /** S0: the prior spread from P50 to P80 in log ratio (0.25 ≈ +28 %). */
  spreadPrior: number
  /** The project-type trend is shrunk by N / (N + typePriorK). */
  typePriorK: number
  /** Hidden sources: at least this many projects per aggregation unit, else they are not used. */
  minHiddenSources: number
  /** With this many stage-1 observations, stages 3 and 4 are not used. */
  stage1Enough: number
  stage3MinSimilarity: number
  stage4MinSimilarity: number
  /** m_u when nothing is learned (plan 12 §3.3). */
  defaultParallelCap: number
  maxParallelCap: number
  maxDays: number
}

/** Plan 12 §9 item 7 recommended defaults. */
export const ESTIMATE_DEFAULTS: Readonly<EstimateConfig> = Object.freeze({
  shrinkK: 3,
  halfLifeDays: 365,
  ratioMin: 0.5,
  ratioMax: 3.0,
  outlierMads: 3,
  madFloor: 0.05,
  spreadPrior: 0.25,
  typePriorK: 10,
  minHiddenSources: 3,
  stage1Enough: 3,
  stage3MinSimilarity: 0.6,
  stage4MinSimilarity: 0.75,
  defaultParallelCap: 2,
  maxParallelCap: 5,
  maxDays: 3650,
})

/**
 * One finished leaf of a finished project (a `plan_actuals_item` that is complete, included in learning and not
 * confidential at use time). Dates are "YYYY-MM-DD".
 */
export interface Observation {
  snapshotItemId: string
  sourceProjectId: string
  lineage: string
  projectType: string
  templateKey: string | null
  name: string
  /** `project_attribute` refs of the source project ("equipment:press-3"). */
  attributes: readonly string[]
  plannedDays: number
  actualDays: number
  closedAt: string
  /**
   * The source project's FIRST finalization: re-finalizing replaces the snapshot but keeps this date, so a
   * re-finalized hidden source does not move in the "oldest first" order (plan 12 §3.2 rule 2).
   */
  finalizedAt: string
  waitGapDays?: number | null
  loadObserved?: number | null
  repoTouched?: number | null
  mrSetLeadTimeHours?: number | null
}

/** A leaf of the base schedule (after lesson rules) to estimate. */
export interface EstimateLeaf {
  key: string
  name: string
  formerKeys?: readonly string[]
  /** T_i: the template's duration (days). */
  templateDays: number
  milestone?: boolean
  /** ℓ_i, 0..1; absent = 1. */
  load?: number
}

/** Aggregate that a hidden-source unit used last time (persisted with the run by E5; see `hiddenAggregate`). */
export interface HiddenState {
  /** The projects used, oldest first. */
  projectIds: readonly string[]
  /** Per-project value y_p used for the aggregate. */
  values: Readonly<Record<string, number>>
  x: number
}

export interface EstimateContext {
  lineage: string
  projectType: string
  attributes: readonly string[]
  /** R: the first day of the month the run is created in (`referenceDateOf`), never the proposed start date. */
  referenceDate: string
  /** Projects the requesting user can `project.view`; every other source is a hidden source. */
  visibleProjectIds: ReadonlySet<string>
  config?: Partial<EstimateConfig>
  /** Name similarity for stages 3–4 (default: pg_trgm-compatible `trigramSimilarity`). */
  similarity?: (a: string, b: string) => number
  /** Hidden aggregates used by the previous run of the same project, by unit key (`ratio:<key>`, `type:<t>`, …). */
  previousHidden?: ReadonlyMap<string, HiddenState>
}

/** A visible source of one leaf's estimate (hidden sources never get a row; plan 12 §3.2 rule 4). */
export interface SourceRef {
  snapshotItemId: string
  sourceProjectId: string
  stage: 1 | 2 | 3 | 4
  similarity: number
  weight: number
  logRatio: number
}

export interface LeafEstimate {
  key: string
  templateDays: number
  d50: number
  d80: number
  r50: number
  r80: number
  /** Effective number of observations (visible kept + hidden h' − 2). Display only as a band (`countBand`). */
  n: number
  alpha: number
  /** A hidden source (directly or through μ0) influenced the leaf: ratios are rounded and days come from them. */
  hiddenInfluenced: boolean
  /** No observation of the item itself; only the project-type trend moved it. */
  typePriorOnly: boolean
  kept: SourceRef[]
  dropped: SourceRef[]
  /**
   * Internal (stored by id in the run for read-time re-resolution, plan 12 §3.2 rule 5): the hidden projects used.
   * NEVER render these; the evidence screen shows only "other projects n (band)".
   */
  hiddenSourceProjectIds: string[]
  /** Suggested wait before the leaf (0 = none; only ≥ 1 day is suggested). */
  lagDays: number
  /** ℓ̂: learned load (the template's ℓ when nothing is learned; 0 stays 0). */
  load: number
  /** Visible sources only (software projects). */
  mrSet: { leadTimeP50Hours: number | null; repoTouchedP50: number | null }
}

export interface TypePrior {
  mu0: number
  /** Visible observations + hidden h' − 2. */
  n: number
  hiddenInfluenced: boolean
  hiddenSourceProjectIds: string[]
}
