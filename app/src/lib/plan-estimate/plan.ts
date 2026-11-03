/**
 * Whole-plan estimate (plan 12 §3.2): every leaf of the base schedule (after lesson rules) is estimated, the
 * schedule is placed with D50 by the same placement the load uses (`planBaseSchedule`), and ONE project buffer
 * B = ceil(sqrt(Σ (D80 − D50)²)) over the critical chain is added instead of padding each leaf.
 * Whether B becomes a plan row is Q4 (recommended: no — the card shows the P50 and P80 end dates side by side).
 * Learned waits (`lagDays`) are reported per leaf; they enter the placement as "not before" constraints in E4.
 */
import { planBaseSchedule, type BaseSchedule, type BaseScheduleItem, type PlannedRow } from "@/lib/plan-schedule/base-schedule"
import { addDays, dayNumber } from "./dates"
import { estimateLeaf, typePrior, type HiddenStateSink } from "./estimate"
import { ceilDays } from "./stats"
import { ESTIMATE_METHOD_VERSION, type EstimateContext, type HiddenState, type LeafEstimate, type Observation, type TypePrior } from "./types"

export interface PlanEstimate {
  methodVersion: string
  referenceDate: string
  typePrior: TypePrior
  leaves: LeafEstimate[]
  /** The schedule with durationDays = D50 on every non-milestone leaf (what a load would write). */
  schedule: BaseSchedule
  templateEnd: string
  p50End: string
  bufferDays: number
  p80End: string
  /** Leaf keys of the critical chain, first to last. */
  criticalKeys: string[]
  /** Hidden aggregates used, to persist as the next run's `previousHidden`. */
  hiddenStates: ReadonlyMap<string, HiddenState>
}

function leavesOf(items: readonly BaseScheduleItem[]): BaseScheduleItem[] {
  return items.flatMap((i) => ((i.children ?? []).length > 0 ? leavesOf(i.children ?? []) : [i]))
}

function withDurations(items: readonly BaseScheduleItem[], days: ReadonlyMap<string, number>): BaseScheduleItem[] {
  return items.map((i) => {
    const children = i.children ?? []
    if (children.length > 0) return { ...i, children: withDurations(children, days) }
    const d = days.get(i.key)
    return i.milestone || d === undefined ? { ...i } : { ...i, durationDays: d }
  })
}

/**
 * The chain of leaves that fixes the end date of a placed schedule: from the latest-ending leaf, repeatedly the
 * leaf that released it — among its predecessor leaves (a dependency on a parent covers its leaves), or, for a leaf
 * without predecessors, among the leaves before it in display order (the placement's cursor) — whose end is the
 * latest before its start. Ties: the later one in display order.
 */
export function criticalChain(rows: readonly PlannedRow[]): string[] {
  const parentKeys = new Set(rows.flatMap((r) => (r.parentKey ? [r.parentKey] : [])))
  const leaves = rows.filter((r) => !parentKeys.has(r.key))
  if (leaves.length === 0) return []
  const byKey = new Map(rows.map((r) => [r.key, r]))
  const order = new Map(leaves.map((l, i) => [l.key, i]))
  const leavesUnder = new Map<string, string[]>()
  for (const l of leaves) {
    let cur: PlannedRow | undefined = l
    while (cur) {
      leavesUnder.set(cur.key, [...(leavesUnder.get(cur.key) ?? []), l.key])
      cur = cur.parentKey ? byKey.get(cur.parentKey) : undefined
    }
  }
  const predLeaves = (leaf: PlannedRow): string[] => {
    const out: string[] = []
    let cur: PlannedRow | undefined = leaf
    while (cur) {
      for (const d of cur.dependsOn) out.push(...(leavesUnder.get(d) ?? []))
      cur = cur.parentKey ? byKey.get(cur.parentKey) : undefined
    }
    return out.filter((k) => k !== leaf.key)
  }
  const startOf = (l: PlannedRow) => dayNumber(l.isMilestone ? l.plannedEnd : l.plannedStart)
  const pick = (cands: readonly PlannedRow[], before: number): PlannedRow | null => {
    let best: PlannedRow | null = null
    for (const c of cands) {
      const end = dayNumber(c.plannedEnd)
      if (end >= before) continue
      if (!best || end > dayNumber(best.plannedEnd) || (end === dayNumber(best.plannedEnd) && (order.get(c.key) ?? 0) > (order.get(best.key) ?? 0))) best = c
    }
    return best
  }

  let current = leaves.reduce((a, b) => (dayNumber(b.plannedEnd) > dayNumber(a.plannedEnd) || (b.plannedEnd === a.plannedEnd && (order.get(b.key) ?? 0) > (order.get(a.key) ?? 0)) ? b : a))
  const chain = [current.key]
  const seen = new Set(chain)
  for (;;) {
    const preds = predLeaves(current)
    const idx = order.get(current.key) ?? 0
    const cands = preds.length > 0 ? preds.flatMap((k) => byKey.get(k) ?? []) : leaves.filter((l) => (order.get(l.key) ?? 0) < idx)
    const next = pick(cands, startOf(current))
    if (!next || seen.has(next.key)) break
    chain.unshift(next.key)
    seen.add(next.key)
    current = next
  }
  return chain
}

export function estimatePlan(schedule: BaseSchedule, observations: readonly Observation[], ctx: EstimateContext, startDate: string): PlanEstimate {
  const sink: HiddenStateSink = new Map()
  const prior = typePrior(observations, ctx, sink)
  const leaves = leavesOf(schedule.items).map((item) =>
    estimateLeaf({ key: item.key, name: item.name, formerKeys: item.formerKeys, templateDays: item.durationDays ?? 1, milestone: item.milestone === true, load: item.load }, observations, ctx, prior, sink)
  )
  const d50 = new Map(leaves.map((l) => [l.key, l.d50]))
  const estimated: BaseSchedule = { ...schedule, items: withDurations(schedule.items, d50) }
  const template = planBaseSchedule(schedule, startDate)
  const placed = planBaseSchedule(estimated, startDate)
  const criticalKeys = criticalChain(placed.rows)
  const byKey = new Map(leaves.map((l) => [l.key, l]))
  const sumSq = criticalKeys.reduce((s, k) => {
    const l = byKey.get(k)
    return l ? s + (l.d80 - l.d50) ** 2 : s
  }, 0)
  const bufferDays = ceilDays(Math.sqrt(sumSq))
  return {
    methodVersion: ESTIMATE_METHOD_VERSION,
    referenceDate: ctx.referenceDate,
    typePrior: prior,
    leaves,
    schedule: estimated,
    templateEnd: template.plannedEnd,
    p50End: placed.plannedEnd,
    bufferDays,
    p80End: addDays(placed.plannedEnd, bufferDays, schedule.skipWeekends === true),
    criticalKeys,
    hiddenStates: sink,
  }
}
