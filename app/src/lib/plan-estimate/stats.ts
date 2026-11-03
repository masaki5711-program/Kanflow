/**
 * Small, deterministic statistics for the estimate engine (plan 12 §3.2). Pure; no input is mutated.
 */

export interface Weighted {
  x: number
  w: number
}

/** Guards `Math.ceil` against binary noise: 10 × 1.1 = 11.000000000000002 must give 11, not 12. */
export function ceilDays(value: number): number {
  return Math.ceil(value - 1e-9)
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Rounds to one decimal (0.1 units; plan 12 §3.2 rule 3). */
export function roundTenth(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * Weighted quantile: the smallest x whose cumulative weight reaches q of the total (ties broken by x, then by
 * input order, so the result is always one of the inputs and never depends on sort stability).
 * Throws on an empty list or a non-positive total weight (callers check emptiness first).
 */
export function weightedQuantile(points: readonly Weighted[], q: number): number {
  if (points.length === 0) throw new Error("weightedQuantile of an empty list")
  if (!(q >= 0 && q <= 1)) throw new Error(`quantile out of range: ${q}`)
  const total = points.reduce((s, p) => s + p.w, 0)
  if (!(total > 0)) throw new Error("weightedQuantile needs a positive total weight")
  const sorted = points.map((p, i) => ({ ...p, i })).toSorted((a, b) => a.x - b.x || a.i - b.i)
  const target = q * total
  let cum = 0
  for (const p of sorted) {
    cum += p.w
    if (cum >= target - 1e-12) return p.x
  }
  return sorted[sorted.length - 1].x
}

export function weightedMedian(points: readonly Weighted[]): number {
  return weightedQuantile(points, 0.5)
}

/** Kish's effective sample size (Σw)² / Σw². 0 for an empty list. */
export function effectiveN(weights: readonly number[]): number {
  const sum = weights.reduce((s, w) => s + w, 0)
  const sq = weights.reduce((s, w) => s + w * w, 0)
  return sq > 0 ? (sum * sum) / sq : 0
}

/** Mean without the largest and the smallest value (needs at least 3 values). */
export function trimmedMean(values: readonly number[]): number {
  if (values.length < 3) throw new Error("trimmedMean needs at least 3 values")
  const sum = values.reduce((s, v) => s + v, 0)
  return (sum - Math.max(...values) - Math.min(...values)) / (values.length - 2)
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) throw new Error("mean of an empty list")
  return values.reduce((s, v) => s + v, 0) / values.length
}
