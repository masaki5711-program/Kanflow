/**
 * The estimator settings an administrator can approve per lineage (found by the deterministic parameter search,
 * services/plan-estimate-eval/param-search.ts). Pure: the grid, the defaults and the membership check every stored
 * value goes through before the estimator uses it.
 */
import { ESTIMATE_DEFAULTS, type EstimateConfig } from "./types"

/** The searched settings, in this order. */
export const TUNED_KEYS = ["outlierMads", "halfLifeDays", "shrinkK", "spreadPrior"] as const
export type TunedKey = (typeof TUNED_KEYS)[number]
export type TunedParams = Readonly<Pick<EstimateConfig, TunedKey>>

/**
 * The grid: a few values around each default (plan 12 §9 item 7: "start with these values and review them by
 * backtest"). 3 × 3 × 3 × 3 = 81 candidates. Every value is one the estimator accepts (resolveConfig).
 */
export const PARAM_GRID: Readonly<Record<TunedKey, readonly number[]>> = Object.freeze({
  outlierMads: [2.5, 3, 3.5],
  halfLifeDays: [180, 365, 730],
  shrinkK: [1.5, 3, 6],
  spreadPrior: [0.15, 0.25, 0.35],
})

export const DEFAULT_PARAMS: TunedParams = Object.freeze({
  outlierMads: ESTIMATE_DEFAULTS.outlierMads,
  halfLifeDays: ESTIMATE_DEFAULTS.halfLifeDays,
  shrinkK: ESTIMATE_DEFAULTS.shrinkK,
  spreadPrior: ESTIMATE_DEFAULTS.spreadPrior,
})

/** Grid membership (also the check of stored settings): every key present, every value one of the grid's. */
export function isGridParams(value: unknown): value is TunedParams {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const keys = Object.keys(value)
  if (keys.length !== TUNED_KEYS.length) return false
  return TUNED_KEYS.every((k) => Object.hasOwn(value, k) && PARAM_GRID[k].includes((value as Record<string, unknown>)[k] as number))
}

