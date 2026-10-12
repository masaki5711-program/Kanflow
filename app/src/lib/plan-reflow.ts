/**
 * 依存関係で再計算 (pure). Every dependency P→S is finish-to-start and
 * STRICT: S must start after P ends (start > end, the same day is a
 * violation). When S violates, its movable leaf subtree is shifted by one
 * calendar delta so S starts the day after P ends (the next business day
 * with `businessDays`). Parents are never moved: their span is derived from
 * the leaves (P's end = the latest end of its leaves, as already moved).
 * Finished / started / undated leaves never move (reported in `skipped`).
 * Dates are "YYYY-MM-DD" strings; arithmetic runs on UTC day numbers.
 */
import { nextBusinessDay } from "@/lib/business-days"
import { dateFromKey, dayIndex } from "@/lib/plan-progress"
import type { ShiftMove, ShiftNode, ShiftResult, SkipReason } from "@/lib/plan-shift"

const DAY_MS = 86_400_000

export interface ReflowOptions {
  businessDays?: boolean
}

interface Span {
  start: number
  end: number
}

type Dep = { predecessorId: string; successorId: string }

const dayOf = (key: string): number => dayIndex(dateFromKey(key) as Date)
const keyOf = (day: number): string => new Date(day * DAY_MS).toISOString().slice(0, 10)

function childrenOf(nodes: readonly ShiftNode[]): Map<string, string[]> {
  const children = new Map<string, string[]>()
  for (const n of nodes) if (n.parentId) children.set(n.parentId, [...(children.get(n.parentId) ?? []), n.id])
  return children
}

/** The leaf rows under `id` (itself when it is a leaf), cycle-safe. */
function leavesUnder(children: ReadonlyMap<string, string[]>, id: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const stack = [id]
  while (stack.length > 0) {
    const cur = stack.pop() as string
    if (seen.has(cur)) continue
    seen.add(cur)
    const kids = children.get(cur) ?? []
    if (kids.length === 0) out.push(cur)
    else stack.push(...kids)
  }
  return out
}

/** True when `a` is an ancestor or a descendant of `b` (cycle-safe). */
function related(byId: ReadonlyMap<string, ShiftNode>, a: string, b: string): boolean {
  const climbs = (from: string, target: string): boolean => {
    const seen = new Set<string>()
    let cur = byId.get(from)?.parentId ?? null
    while (cur && !seen.has(cur)) {
      if (cur === target) return true
      seen.add(cur)
      cur = byId.get(cur)?.parentId ?? null
    }
    return false
  }
  return climbs(a, b) || climbs(b, a)
}

/** The dependencies whose successor can be ordered topologically (members of a cycle are dropped), successors in topological order. */
function orderDeps(deps: readonly Dep[]): Dep[] {
  const indegree = new Map<string, number>()
  const next = new Map<string, string[]>()
  for (const d of deps) {
    indegree.set(d.predecessorId, indegree.get(d.predecessorId) ?? 0)
    indegree.set(d.successorId, (indegree.get(d.successorId) ?? 0) + 1)
    next.set(d.predecessorId, [...(next.get(d.predecessorId) ?? []), d.successorId])
  }
  const rank = new Map<string, number>()
  const queue = [...indegree].filter(([, n]) => n === 0).map(([id]) => id)
  while (queue.length > 0) {
    const id = queue.shift() as string
    rank.set(id, rank.size)
    for (const s of next.get(id) ?? []) {
      const left = (indegree.get(s) ?? 0) - 1
      indegree.set(s, left)
      if (left === 0) queue.push(s)
    }
  }
  return deps
    .filter((d) => rank.has(d.predecessorId) && rank.has(d.successorId))
    .sort((a, b) => (rank.get(a.successorId) as number) - (rank.get(b.successorId) as number))
}

const isFixed = (n: ShiftNode): boolean => n.status === "done" || n.actualEnd !== null || n.actualStart !== null
const fixedReason = (n: ShiftNode): SkipReason => (n.status === "done" || n.actualEnd ? "done" : "started")

interface Ctx {
  byId: ReadonlyMap<string, ShiftNode>
  children: ReadonlyMap<string, string[]>
  spans: Map<string, Span>
  skipped: Map<string, SkipReason>
  businessDays: boolean
}

/** Earliest start / latest end of the dated leaves among `ids`; null when none is dated. */
function spanOf(spans: ReadonlyMap<string, Span>, ids: readonly string[]): Span | null {
  const dated = ids.map((id) => spans.get(id)).filter((s): s is Span => s !== undefined)
  if (dated.length === 0) return null
  return { start: Math.min(...dated.map((s) => s.start)), end: Math.max(...dated.map((s) => s.end)) }
}

/** Enforce one dependency; true when a leaf moved. */
function enforce(ctx: Ctx, dep: Dep): boolean {
  const pSpan = spanOf(ctx.spans, leavesUnder(ctx.children, dep.predecessorId))
  if (!pSpan) return false
  const leaves = leavesUnder(ctx.children, dep.successorId)
  const dated = leaves.filter((id) => ctx.spans.has(id))
  if (!dated.some((id) => (ctx.spans.get(id) as Span).start <= pSpan.end)) return false
  for (const id of leaves) if (!ctx.spans.has(id)) ctx.skipped.set(id, "undated")
  const movable = dated.filter((id) => !isFixed(ctx.byId.get(id) as ShiftNode))
  for (const id of dated) {
    const node = ctx.byId.get(id) as ShiftNode
    if (isFixed(node)) ctx.skipped.set(id, fixedReason(node))
  }
  const first = spanOf(ctx.spans, movable)
  if (!first) return false
  const after = keyOf(pSpan.end + 1)
  const required = dayOf(ctx.businessDays ? nextBusinessDay(after) : after)
  const delta = required - first.start
  if (delta <= 0) return false
  for (const id of movable) {
    const s = ctx.spans.get(id) as Span
    ctx.spans.set(id, { start: s.start + delta, end: s.end + delta })
  }
  return true
}

/**
 * The moves that make every dependency strict finish-to-start. Dependencies
 * are visited in topological order of their successors; passes repeat until
 * stable (a parent's end depends on its leaves, which can move later in the
 * same run), capped so a pathological graph cannot loop. Dependencies that
 * belong to a cycle, or link a row with its own ancestor / descendant, are ignored.
 */
export function planReflow(nodes: readonly ShiftNode[], deps: readonly Dep[], opts: ReflowOptions = {}): ShiftResult {
  const spans = new Map<string, Span>()
  for (const n of nodes) {
    if (n.plannedStart && n.plannedEnd) spans.set(n.id, { start: dayOf(n.plannedStart), end: dayOf(n.plannedEnd) })
  }
  const original = new Map(spans)
  const byId = new Map(nodes.map((n) => [n.id, n]))
  // Self, ancestor / descendant dependencies are contradictory (a parent spans its children): ignored like cycles.
  const ordered = orderDeps(deps.filter((d) => d.predecessorId !== d.successorId && !related(byId, d.predecessorId, d.successorId)))
  const ctx: Ctx = {
    byId,
    children: childrenOf(nodes),
    spans,
    skipped: new Map(),
    businessDays: opts.businessDays === true,
  }
  const maxPasses = ordered.length + 2
  for (let pass = 0; pass < maxPasses; pass += 1) {
    let changed = false
    for (const dep of ordered) if (enforce(ctx, dep)) changed = true
    if (!changed) break
  }
  const moved: ShiftMove[] = []
  for (const n of nodes) {
    const from = original.get(n.id)
    const to = spans.get(n.id)
    if (!from || !to || (from.start === to.start && from.end === to.end)) continue
    moved.push({ id: n.id, plannedStart: keyOf(from.start), plannedEnd: keyOf(from.end), newStart: keyOf(to.start), newEnd: keyOf(to.end) })
  }
  const skipped = nodes.filter((n) => ctx.skipped.has(n.id) && !moved.some((m) => m.id === n.id)).map((n) => ({ id: n.id, reason: ctx.skipped.get(n.id) as SkipReason }))
  return { moved, skipped }
}
