/**
 * Hidden sources (plan 12 §3.2 rules 1, 2, 3-2, 6 and the final re-review LOW): every aggregate that may include
 * projects the requesting user cannot view goes through `hiddenAggregate`, so that no single hidden project can be
 * read back from an estimate:
 *  1. per aggregation unit, fewer than `minHiddenSources` hidden projects → not used at all;
 *  2. only the oldest h' projects (by first finalization) are used, h' = h rounded DOWN to an even number, so one
 *     newly finalized hidden project never changes the result — only a pair does;
 *  3-2. each project collapses to one value y_p (the mean of its points), and the aggregate is the mean without the
 *     largest and the smallest y_p (a median could equal one project's value);
 *  LOW: when exactly ONE thing changed since the last published aggregate of the unit — one y_p changed
 *     (re-finalized, a PBI became confidential) or one used project was replaced by another (it left learning and the
 *     next oldest moved in) — the previous aggregate is kept until a second change accumulates.
 *     The previous state must come from a GLOBAL store shared by every project and viewer (see `hiddenUnitKey`):
 *     a per-project history would let a fresh project read the changed value.
 * h' ≥ 4 is required (trimming needs h' − 2 ≥ 2), so hidden sources take effect from 4 projects per unit.
 */
import { mean, trimmedMean } from "./stats"
import type { EstimateConfig, HiddenState } from "./types"

export interface HiddenPoint {
  projectId: string
  /** First finalization of the project ("YYYY-MM-DD"). */
  orderAt: string
  x: number
  w: number
}

export interface HiddenAggregate {
  x: number
  /** (h' − 2) × the mean weight of the used projects. */
  w: number
  hPrime: number
  projectIds: string[]
  /** What to persist for the next run (the previous state when it was held). */
  state: HiddenState
  held: boolean
}

const SAME = 1e-12

export function hiddenAggregate(points: readonly HiddenPoint[], config: Pick<EstimateConfig, "minHiddenSources">, previous?: HiddenState): HiddenAggregate | null {
  const byProject = new Map<string, HiddenPoint[]>()
  for (const p of points) byProject.set(p.projectId, [...(byProject.get(p.projectId) ?? []), p])
  if (byProject.size < config.minHiddenSources) return null

  const projects = [...byProject.entries()]
    .map(([projectId, ps]) => ({
      projectId,
      orderAt: ps.map((p) => p.orderAt).toSorted()[0],
      // Weighted by w (similarity × recency): a weak stage-4 match counts less than an exact key match.
      y: weightedMean(ps),
      w: mean(ps.map((p) => p.w)),
    }))
    .toSorted((a, b) => (a.orderAt < b.orderAt ? -1 : a.orderAt > b.orderAt ? 1 : a.projectId < b.projectId ? -1 : a.projectId > b.projectId ? 1 : 0))
  const hPrime = Math.floor(projects.length / 2) * 2
  if (hPrime < 4) return null
  const used = projects.slice(0, hPrime)
  const projectIds = used.map((p) => p.projectId)
  const values = Object.fromEntries(used.map((p) => [p.projectId, p.y]))
  const w = (hPrime - 2) * mean(used.map((p) => p.w))

  if (previous && previous.projectIds.length === projectIds.length) {
    const before = new Set(previous.projectIds)
    const replaced = projectIds.filter((id) => !before.has(id)).length
    const changedValues = projectIds.filter((id) => before.has(id) && !(Math.abs(previous.values[id] - values[id]) <= SAME)).length
    if (replaced + changedValues === 1) return { x: previous.x, w, hPrime, projectIds, state: previous, held: true }
  }
  const x = trimmedMean(used.map((p) => p.y))
  return { x, w, hPrime, projectIds, state: { projectIds, values, x }, held: false }
}

function weightedMean(ps: readonly HiddenPoint[]): number {
  const total = ps.reduce((s, p) => s + p.w, 0)
  return total > 0 ? ps.reduce((s, p) => s + p.x * p.w, 0) / total : mean(ps.map((p) => p.x))
}

/**
 * Key of a hidden-aggregation unit in the GLOBAL held-state store: everything that decides which points the unit
 * aggregates (kind, lineage, project type, attributes, leaf key / name / former keys) and the viewer's visibility
 * class (the visible projects among the unit's observations). The member set is NOT part of the key — the hold rule
 * compares it.
 *
 * Known residual (for E5's store, review MEDIUM 2): a project LEAVING an even h' (6 used → 5 left → 4 used) changes the
 * length, so it is recomputed; the change then mixes two projects' values (y2 and y6) instead of exposing one.
 */
export function hiddenUnitKey(kind: "ratio" | "lag" | "load" | "type" | "parallel", parts: readonly (string | readonly string[])[]): string {
  return JSON.stringify([kind, ...parts.map((p) => (typeof p === "string" ? p : [...p].toSorted()))])
}

/** Counts shown to users are bands, never exact (plan 12 §3.2 rule 3). */
export function countBand(n: number): "~3" | "4-9" | "10+" {
  if (n < 4) return "~3"
  if (n < 10) return "4-9"
  return "10+"
}
