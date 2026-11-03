/**
 * Hidden sources (plan 12 §3.2 rules 1, 2, 3-2, 6 and the final re-review LOW): every aggregate that may include
 * projects the requesting user cannot view goes through `hiddenAggregate`, so that no single hidden project can be
 * read back from an estimate:
 *  1. per aggregation unit, fewer than `minHiddenSources` hidden projects → not used at all;
 *  2. only the oldest h' projects (by first finalization) are used, h' = h rounded DOWN to an even number, so one
 *     newly finalized hidden project never changes the result — only a pair does;
 *  3-2. each project collapses to one value y_p (the mean of its points), and the aggregate is the mean without the
 *     largest and the smallest y_p (a median could equal one project's value);
 *  LOW: when the same projects are used but exactly one y_p changed (re-finalized, a PBI became confidential), the
 *     previous aggregate is kept until a second project's value changes too.
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
      y: mean(ps.map((p) => p.x)),
      w: mean(ps.map((p) => p.w)),
    }))
    .toSorted((a, b) => (a.orderAt < b.orderAt ? -1 : a.orderAt > b.orderAt ? 1 : a.projectId < b.projectId ? -1 : a.projectId > b.projectId ? 1 : 0))
  const hPrime = Math.floor(projects.length / 2) * 2
  if (hPrime < 4) return null
  const used = projects.slice(0, hPrime)
  const projectIds = used.map((p) => p.projectId)
  const values = Object.fromEntries(used.map((p) => [p.projectId, p.y]))
  const w = (hPrime - 2) * mean(used.map((p) => p.w))

  if (previous && sameMembers(previous.projectIds, projectIds)) {
    const changed = projectIds.filter((id) => Math.abs((previous.values[id] ?? Number.NaN) - values[id]) > SAME || Number.isNaN(previous.values[id] ?? Number.NaN)).length
    if (changed === 1) return { x: previous.x, w, hPrime, projectIds, state: previous, held: true }
  }
  const x = trimmedMean(used.map((p) => p.y))
  return { x, w, hPrime, projectIds, state: { projectIds, values, x }, held: false }
}

function sameMembers(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((id) => set.has(id))
}

/** Counts shown to users are bands, never exact (plan 12 §3.2 rule 3). */
export function countBand(n: number): "~3" | "4-9" | "10+" {
  if (n < 4) return "~3"
  if (n < 10) return "4-9"
  return "10+"
}
