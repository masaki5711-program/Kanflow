/**
 * Load levelling of a base schedule (plan 12 §3.5, E4, "B-1"). Pure and deterministic: the same input gives the same
 * placement (ties break on userId and the template order). The service builds the input — who may hold which role
 * (project members only), each person's capacity C_u(d) per working day (FTE minus what they hold in OTHER projects),
 * and the parallel cap m_u — and stores nothing; owners stay a proposal (plan 12 §3.6).
 *
 * Time is counted in WORKING days on an index axis: index 0 is the first working day on or after the start date
 * (Mon–Fri with skipWeekends, every day otherwise). Durations, lags and capacities are per working day.
 *
 * Algorithm (plan 12 §3.5):
 * 1. Critical path (forward / backward pass with lags): ES, EF, LS, LF, total float TF.
 * 2. Repeatedly take the eligible item (all predecessors placed) with the smallest (TF, LF, −successor chain, order).
 * 3. t0 = max(predecessors' end + 1 + lag). For each candidate of its role, the earliest t ≥ t0 where every day of
 *    [t, t + D − 1] has used + ℓ ≤ C_u and count < m_u. Choose by (finish, load already given, userId).
 * 4. If that start is later than LS and the item may be split (a `split` rule, or D ≥ 4 with two candidates), try two
 *    parallel parts of ceil(D / 2 × 1.1) days by different people; keep it only when it finishes earlier.
 * ℓ = 0 items (waiting on a delivery, …) use no capacity. An item whose role has no candidate gets no owner.
 *
 * A person works on an item with all the time they have: on a day, an item takes min(ℓ, FTE_u(d)) of the person
 * (so a half-time person can hold a full item — at their pace — and a day with FTE 0 holds nothing). Without `fte`
 * the item takes ℓ.
 */

/** How far (working days) a start may be pushed looking for capacity before it is placed overloaded. */
export const LEVEL_HORIZON_DAYS = 2_000
/** Overhead of splitting an item into two parallel parts (each part is ceil(D / 2 × 1.1)). */
export const SPLIT_OVERHEAD = 1.1
/** An item must be at least this long to be split without an explicit `split` rule. */
export const SPLIT_MIN_DAYS = 4

export interface LevelItem {
  key: string
  /** D: duration in working days (≥ 1; a milestone counts as 1). */
  days: number
  /** ℓ: share of a person's day the item takes, 0..1 (0 = waiting, no capacity used). */
  load: number
  /** Role whose candidates may hold it (null / no candidates = no owner). */
  role: string | null
  predecessors: readonly string[]
  /** Extra working days to wait after the last predecessor (the learned lag). */
  lagDays?: number
  /** Template order (the last tie-break). */
  order: number
  /** A `split` lesson rule names this item. */
  splittable?: boolean
}

export interface LevelInput {
  items: readonly LevelItem[]
  /** Candidates per role (project members only — the service checks). */
  assign: Readonly<Record<string, readonly string[]>>
  /** C_u(d) for working-day index d: FTE (and project allocation) minus the user's load in other projects, ≥ 0. */
  capacity: (userId: string, day: number) => number
  /** m_u: how many items the user may hold at once. */
  parallelCap: (userId: string) => number
  /** FTE_u(d) before other projects' load (0..1); an item takes min(ℓ, FTE) of the day. Omitted = an item takes ℓ. */
  fte?: (userId: string, day: number) => number
  /** Propose splitting a late item into two parallel parts (default true). Off = every item stays whole. */
  split?: boolean
}

export interface PlacedPart {
  start: number
  end: number
  owner: string | null
}

export interface Placement extends PlacedPart {
  key: string
  /** Proposed split into parallel parts (owners differ). */
  split?: PlacedPart[]
  /** No window with enough capacity within the horizon: placed at t0 over capacity. */
  overloaded?: boolean
}

export interface UsageSummary {
  /** Highest used ÷ capacity over the working days (Infinity-free: a day with capacity 0 and use counts as over). */
  maxUtilization: number
  /** Working days with use above capacity. */
  daysOverCapacity: number
}

export interface Move {
  key: string
  from: PlacedPart
  to: PlacedPart
  reason: "capacity" | "split"
}

export interface LevelResult {
  placements: Placement[]
  /** Template days with the first candidate as owner, ignoring capacity (what the plan would be without levelling). */
  before: Record<string, UsageSummary>
  after: Record<string, UsageSummary>
  moves: Move[]
  /** Last working-day index of the levelled plan (−1 for an empty plan). */
  end: number
}

const EPS = 1e-9

interface Cpm {
  es: Map<string, number>
  ls: Map<string, number>
  tf: Map<string, number>
  chain: Map<string, number>
}

/** Critical path on the working-day axis. Items are assumed acyclic (the schedule was validated when loaded). */
export function criticalPath(items: readonly LevelItem[]): Cpm {
  const byKey = new Map(items.map((i) => [i.key, i]))
  const succ = new Map<string, string[]>()
  for (const i of items) for (const p of i.predecessors) if (byKey.has(p)) succ.set(p, [...(succ.get(p) ?? []), i.key])
  const order = topo(items)
  const es = new Map<string, number>()
  const ef = new Map<string, number>()
  for (const k of order) {
    const it = byKey.get(k) as LevelItem
    const start = Math.max(0, ...it.predecessors.filter((p) => byKey.has(p)).map((p) => (ef.get(p) ?? -1) + 1 + (it.lagDays ?? 0)))
    es.set(k, start)
    ef.set(k, start + it.days - 1)
  }
  const projectEnd = Math.max(-1, ...ef.values())
  const ls = new Map<string, number>()
  const lf = new Map<string, number>()
  const chain = new Map<string, number>()
  for (const k of [...order].reverse()) {
    const it = byKey.get(k) as LevelItem
    const next = succ.get(k) ?? []
    const finish = next.length ? Math.min(...next.map((s) => (ls.get(s) as number) - 1 - ((byKey.get(s) as LevelItem).lagDays ?? 0))) : projectEnd
    lf.set(k, finish)
    ls.set(k, finish - it.days + 1)
    chain.set(k, it.days + Math.max(0, ...next.map((s) => chain.get(s) ?? 0)))
  }
  const tf = new Map(order.map((k) => [k, (ls.get(k) as number) - (es.get(k) as number)]))
  return { es, ls, tf, chain }
}

/** Keys in a dependency order (stable on the template order; a cycle is broken at the lowest order). */
function topo(items: readonly LevelItem[]): string[] {
  const byKey = new Map(items.map((i) => [i.key, i]))
  const remaining = new Map(items.map((i) => [i.key, new Set(i.predecessors.filter((p) => byKey.has(p) && p !== i.key))]))
  const sorted = [...items].sort((a, b) => a.order - b.order || (a.key < b.key ? -1 : 1))
  const out: string[] = []
  while (out.length < items.length) {
    const next = sorted.find((i) => remaining.has(i.key) && (remaining.get(i.key) as Set<string>).size === 0) ?? sorted.find((i) => remaining.has(i.key))
    if (!next) break
    out.push(next.key)
    remaining.delete(next.key)
    for (const set of remaining.values()) set.delete(next.key)
  }
  return out
}

class Ledger {
  readonly used = new Map<string, Map<number, number>>()
  readonly count = new Map<string, Map<number, number>>()
  readonly given = new Map<string, number>()

  use(u: string, d: number): number {
    return this.used.get(u)?.get(d) ?? 0
  }
  held(u: string, d: number): number {
    return this.count.get(u)?.get(d) ?? 0
  }
  add(u: string, start: number, days: number, load: number, take: Take): void {
    if (load <= 0) return
    const used = this.used.get(u) ?? new Map<number, number>()
    const count = this.count.get(u) ?? new Map<number, number>()
    let given = 0
    for (let d = start; d < start + days; d++) {
      const share = take(u, d, load)
      used.set(d, (used.get(d) ?? 0) + share)
      count.set(d, (count.get(d) ?? 0) + 1)
      given += share
    }
    this.used.set(u, used)
    this.count.set(u, count)
    this.given.set(u, (this.given.get(u) ?? 0) + given)
  }
}

/** What an item of load ℓ takes of person u on working day d. */
type Take = (u: string, d: number, load: number) => number

/** Placement: min(ℓ, FTE_u(d)) — 0 on a day without time, which then holds nothing. Without FTEs: ℓ. */
function takeOf(input: LevelInput): Take {
  const fte = input.fte
  return fte ? (u, d, load) => Math.min(load, Math.max(0, fte(u, d))) : (_u, _d, load) => load
}

/** Summary: like placement, but on a day without time the item still takes ℓ (so it shows as over capacity). */
function summaryTakeOf(input: LevelInput): Take {
  const fte = input.fte
  if (!fte) return (_u, _d, load) => load
  return (u, d, load) => {
    const f = Math.max(0, fte(u, d))
    return f > EPS ? Math.min(load, f) : load
  }
}

/** Earliest t ≥ t0 where [t, t + days − 1] fits u's capacity and parallel cap (null within the horizon = none). */
function earliestFit(input: LevelInput, ledger: Ledger, u: string, t0: number, days: number, load: number, take: Take): number | null {
  if (load <= 0) return t0
  const cap = input.parallelCap(u)
  let t = t0
  while (t <= t0 + LEVEL_HORIZON_DAYS) {
    let bad = -1
    for (let d = t; d < t + days; d++) {
      const share = take(u, d, load)
      // A day where the person has no time at all (FTE 0) holds nothing.
      if (share <= EPS || ledger.use(u, d) + share > input.capacity(u, d) + EPS || ledger.held(u, d) >= cap) {
        bad = d
        break
      }
    }
    if (bad < 0) return t
    t = bad + 1
  }
  return null
}

function candidatesOf(input: LevelInput, item: LevelItem): string[] {
  const list = item.role ? (input.assign[item.role] ?? []) : []
  return [...new Set(list)].sort()
}

function summarize(input: LevelInput, parts: readonly { owner: string | null; start: number; days: number; load: number }[]): Record<string, UsageSummary> {
  const ledger = new Ledger()
  const take = summaryTakeOf(input)
  for (const p of parts) if (p.owner) ledger.add(p.owner, p.start, p.days, p.load, take)
  const out: Record<string, UsageSummary> = {}
  for (const [u, days] of ledger.used) {
    let max = 0
    let over = 0
    for (const [d, used] of days) {
      const cap = input.capacity(u, d)
      const ratio = cap > EPS ? used / cap : used > EPS ? Number.MAX_SAFE_INTEGER : 0
      max = Math.max(max, ratio)
      if (used > cap + EPS) over++
    }
    out[u] = { maxUtilization: Math.round(Math.min(max, 99) * 100) / 100, daysOverCapacity: over }
  }
  return out
}

export function level(input: LevelInput): LevelResult {
  const items = [...input.items]
  if (items.length === 0) return { placements: [], before: {}, after: {}, moves: [], end: -1 }
  const byKey = new Map(items.map((i) => [i.key, i]))
  const cpm = criticalPath(items)

  // Before: the template days at their earliest start, the first candidate as owner, capacity ignored.
  const beforeParts = items.map((i) => ({ key: i.key, owner: candidatesOf(input, i)[0] ?? null, start: cpm.es.get(i.key) as number, days: i.days, load: i.load }))
  const before = summarize(input, beforeParts)

  const ledger = new Ledger()
  const take = takeOf(input)
  const placed = new Map<string, Placement>()
  const endOf = (k: string): number => {
    const p = placed.get(k) as Placement
    return p.split ? Math.max(...p.split.map((s) => s.end)) : p.end
  }
  while (placed.size < items.length) {
    const eligible = items.filter((i) => !placed.has(i.key) && i.predecessors.every((p) => !byKey.has(p) || placed.has(p)))
    // A dependency cycle would leave nothing eligible: release the lowest-order item (the schedule is validated, so
    // this is only a guard).
    const pool = eligible.length ? eligible : items.filter((i) => !placed.has(i.key))
    pool.sort(
      (a, b) =>
        (cpm.tf.get(a.key) as number) - (cpm.tf.get(b.key) as number) ||
        (cpm.ls.get(a.key) as number) + a.days - ((cpm.ls.get(b.key) as number) + b.days) ||
        (cpm.chain.get(b.key) as number) - (cpm.chain.get(a.key) as number) ||
        a.order - b.order ||
        (a.key < b.key ? -1 : 1),
    )
    const item = pool[0]
    const t0 = Math.max(0, ...item.predecessors.filter((p) => placed.has(p)).map((p) => endOf(p) + 1 + (item.lagDays ?? 0)))
    const cands = candidatesOf(input, item)
    if (cands.length === 0) {
      placed.set(item.key, { key: item.key, start: t0, end: t0 + item.days - 1, owner: null })
      continue
    }
    const options = cands.map((u) => ({ u, t: earliestFit(input, ledger, u, t0, item.days, item.load, take) }))
    const fitting = options.filter((o): o is { u: string; t: number } => o.t !== null)
    if (fitting.length === 0) {
      // No room within the horizon: keep the earliest start on the candidate given the least so far, and say so.
      const u = [...cands].sort((a, b) => (ledger.given.get(a) ?? 0) - (ledger.given.get(b) ?? 0) || (a < b ? -1 : 1))[0]
      ledger.add(u, t0, item.days, item.load, take)
      placed.set(item.key, { key: item.key, start: t0, end: t0 + item.days - 1, owner: u, overloaded: true })
      continue
    }
    fitting.sort((a, b) => a.t - b.t || (ledger.given.get(a.u) ?? 0) - (ledger.given.get(b.u) ?? 0) || (a.u < b.u ? -1 : 1))
    const best = fitting[0]
    const single: Placement = { key: item.key, start: best.t, end: best.t + item.days - 1, owner: best.u }

    const late = best.t > (cpm.ls.get(item.key) as number)
    const mayHalve = item.splittable === true || (item.days >= SPLIT_MIN_DAYS && cands.length >= 2)
    if (input.split !== false && late && mayHalve && cands.length >= 2 && item.load > 0) {
      const half = Math.ceil((item.days / 2) * SPLIT_OVERHEAD)
      const a = cands.map((u) => ({ u, t: earliestFit(input, ledger, u, t0, half, item.load, take) })).filter((o): o is { u: string; t: number } => o.t !== null)
      a.sort((x, y) => x.t - y.t || (x.u < y.u ? -1 : 1))
      if (a.length >= 2) {
        const first = a[0]
        // The second part goes to someone else (two people in parallel, never the same person twice).
        const second = a.find((o) => o.u !== first.u)
        if (second) {
          const splitEnd = Math.max(first.t, second.t) + half - 1
          if (splitEnd < single.end) {
            ledger.add(first.u, first.t, half, item.load, take)
            ledger.add(second.u, second.t, half, item.load, take)
            const parts = [
              { start: first.t, end: first.t + half - 1, owner: first.u },
              { start: second.t, end: second.t + half - 1, owner: second.u },
            ].sort((x, y) => x.start - y.start || ((x.owner ?? "") < (y.owner ?? "") ? -1 : 1))
            placed.set(item.key, { key: item.key, start: Math.min(first.t, second.t), end: splitEnd, owner: first.u, split: parts })
            continue
          }
        }
      }
    }
    ledger.add(best.u, best.t, item.days, item.load, take)
    placed.set(item.key, single)
  }

  const placements = items.map((i) => placed.get(i.key) as Placement)
  const afterParts = placements.flatMap((p) => {
    const it = byKey.get(p.key) as LevelItem
    return p.split ? p.split.map((s) => ({ owner: s.owner, start: s.start, days: s.end - s.start + 1, load: it.load })) : [{ owner: p.owner, start: p.start, days: it.days, load: it.load }]
  })
  const after = summarize(input, afterParts)
  const moves: Move[] = []
  const beforeByKey = new Map(beforeParts.map((b) => [b.key, b]))
  for (const p of placements) {
    const b = beforeByKey.get(p.key) as (typeof beforeParts)[number]
    const from = { start: b.start, end: b.start + b.days - 1, owner: b.owner }
    const to = { start: p.start, end: p.end, owner: p.owner }
    if (p.split) moves.push({ key: p.key, from, to, reason: "split" })
    else if (from.start !== to.start || from.owner !== to.owner) moves.push({ key: p.key, from, to, reason: "capacity" })
  }
  return { placements, before, after, moves, end: Math.max(...placements.map((p) => p.end)) }
}

// ---------------------------------------------------------------- m_u ------------------------------------------------

export interface ParallelCapConfig {
  defaultCap: number
  maxCap: number
  /** Shrinkage constant: the learned value counts n / (n + k). */
  k: number
}

export const PARALLEL_CAP_DEFAULTS: Readonly<ParallelCapConfig> = Object.freeze({ defaultCap: 2, maxCap: 5, k: 3 })

/** 80th percentile (nearest rank) of a non-empty list. */
function p80(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.ceil(0.8 * s.length) - 1)]
}

/**
 * m_u (plan 12 §3.5): the 80th percentile of the user's past `ownerConcurrentPeak`, shrunk toward the default by
 * n / (n + k), rounded, within 1..maxCap. No history = the default. A `cap_parallel` rule for the role wins (caller).
 */
export function learnParallelCap(peaks: readonly number[], config: Partial<ParallelCapConfig> = {}): number {
  const c = { ...PARALLEL_CAP_DEFAULTS, ...config }
  const valid = peaks.filter((p) => Number.isFinite(p) && p >= 1)
  if (valid.length === 0) return c.defaultCap
  const alpha = valid.length / (valid.length + c.k)
  const shrunk = c.defaultCap + (p80(valid) - c.defaultCap) * alpha
  return Math.min(c.maxCap, Math.max(1, Math.round(shrunk)))
}
