/**
 * 「開始日を入れて日程を仮置き」: pure date placement of undated plan items
 * from a start date using their 目安期間 (durationDays).
 *
 * Depth-first in display order (sortOrder), one cursor day:
 *  - an undated leaf of d days (durationDays, else 1) takes [cursor, cursor + d − 1];
 *    a milestone sits on the LAST day of its d-day window; the cursor moves by d;
 *  - a leaf that already has dates is kept and pushes the cursor past its end;
 *  - parents are not written: their span is derived from the children
 *    (recalcPlanProgress), so children fill their parent's window in order.
 */
import { dateFromKey, dayIndex, toDateKey } from "@/lib/plan-progress"

const DAY_MS = 86_400_000
/** Days of an undated leaf without 目安期間. */
export const DEFAULT_SCHEDULE_DAYS = 1

export interface ScheduleNode {
  id: string
  parentId: string | null
  sortOrder: number
  isMilestone: boolean
  durationDays: number | null
  /** "YYYY-MM-DD" or null (日程未定). */
  plannedStart: string | null
  plannedEnd: string | null
}

export interface ScheduledDates {
  id: string
  plannedStart: string
  plannedEnd: string
}

/** True when `id` can reach itself over the "waits for" edges (cycle-safe). */
function waitsForItself(id: string, waitingOn: ReadonlyMap<string, readonly string[]>): boolean {
  const seen = new Set<string>()
  const queue = [...(waitingOn.get(id) ?? [])]
  while (queue.length > 0) {
    const cur = queue.shift() as string
    if (cur === id) return true
    if (seen.has(cur)) continue
    seen.add(cur)
    queue.push(...(waitingOn.get(cur) ?? []))
  }
  return false
}

const keyOf = (day: number) => toDateKey(new Date(day * DAY_MS))

export interface ScheduleDependency {
  predecessorId: string
  successorId: string
}

export interface ScheduleOptions {
  /** Count only Monday–Friday: a 5-day item spans a weekend instead of ending on it. */
  skipWeekends?: boolean
  /**
   * Finish-to-start dependencies. An undated leaf that has a predecessor starts
   * the day after the latest predecessor ends (it may run beside the leaves
   * placed before it); a dependency on a parent covers all of the parent's
   * leaves. Leaves without a predecessor keep following each other in order.
   */
  dependencies?: readonly ScheduleDependency[]
}

/** 1970-01-01 (day 0) was a Thursday; 0 = Sunday … 6 = Saturday. */
const isWeekend = (day: number) => {
  const w = (((day + 4) % 7) + 7) % 7
  return w === 0 || w === 6
}

/** `day` itself when it is a weekday, else the following Monday. */
const nextWeekday = (day: number): number => (isWeekend(day) ? nextWeekday(day + 1) : day)

/** The day on which an item of `days` counted days, starting on `first`, ends. */
function lastDayOf(first: number, days: number, skipWeekends: boolean): number {
  if (!skipWeekends) return first + days - 1
  let last = first
  for (let left = days - 1; left > 0; left--) last = nextWeekday(last + 1)
  return last
}

function childrenIndex(nodes: readonly ScheduleNode[]): Map<string | null, ScheduleNode[]> {
  const ids = new Set(nodes.map((n) => n.id))
  const out = new Map<string | null, ScheduleNode[]>()
  for (const n of nodes) {
    const parent = n.parentId && ids.has(n.parentId) ? n.parentId : null
    out.set(parent, [...(out.get(parent) ?? []), n])
  }
  for (const [k, list] of out) out.set(k, list.toSorted((a, b) => a.sortOrder - b.sortOrder))
  return out
}

/**
 * Pure: dates for every undated leaf under `rootIds` (null = the whole plan,
 * top level in order), starting at `startKey` ("YYYY-MM-DD"). Unknown root
 * ids are ignored; an invalid start date yields no dates.
 */
export function scheduleFrom(nodes: readonly ScheduleNode[], rootIds: readonly string[] | null, startKey: string, options: ScheduleOptions = {}): ScheduledDates[] {
  const skipWeekends = options.skipWeekends === true
  const start = dateFromKey(startKey)
  if (!start) return []
  const kids = childrenIndex(nodes)
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const roots = rootIds === null ? (kids.get(null) ?? []) : rootIds.flatMap((id) => byId.get(id) ?? []).toSorted((a, b) => a.sortOrder - b.sortOrder)

  // Leaves in display order, each with the ids of its ancestors (a dependency on a parent covers its leaves).
  const order: { leaf: ScheduleNode; chain: string[] }[] = []
  const seen = new Set<string>()
  const collect = (node: ScheduleNode, chain: string[]): void => {
    if (seen.has(node.id)) return
    seen.add(node.id)
    const children = kids.get(node.id) ?? []
    if (children.length === 0) order.push({ leaf: node, chain: [...chain, node.id] })
    else children.forEach((c) => collect(c, [...chain, node.id]))
  }
  roots.forEach((r) => collect(r, []))

  const leavesUnder = new Map<string, string[]>()
  for (const { leaf, chain } of order) for (const id of chain) leavesUnder.set(id, [...(leavesUnder.get(id) ?? []), leaf.id])
  const predsOf = new Map<string, string[]>()
  for (const d of options.dependencies ?? []) predsOf.set(d.successorId, [...(predsOf.get(d.successorId) ?? []), d.predecessorId])
  /** Predecessor leaves of a leaf: those of the leaf itself and of every ancestor. */
  const predLeaves = (chain: readonly string[], self: string): string[] =>
    chain.flatMap((id) => predsOf.get(id) ?? []).flatMap((p) => leavesUnder.get(p) ?? []).filter((id) => id !== self)

  const out: ScheduledDates[] = []
  const endOf = new Map<string, number>()
  const done = new Set<string>()
  const startDay = dayIndex(start)
  let cursor = startDay

  const place = ({ leaf, chain }: { leaf: ScheduleNode; chain: string[] }): void => {
    done.add(leaf.id)
    if (leaf.plannedStart && leaf.plannedEnd) {
      const end = dayIndex(dateFromKey(leaf.plannedEnd) ?? start)
      endOf.set(leaf.id, end)
      cursor = Math.max(cursor, end + 1)
      return
    }
    const ends = predLeaves(chain, leaf.id).flatMap((id) => endOf.get(id) ?? [])
    const wanted = ends.length > 0 ? Math.max(startDay, ...ends.map((e) => e + 1)) : cursor
    const days = Math.max(1, leaf.durationDays ?? DEFAULT_SCHEDULE_DAYS)
    const first = skipWeekends ? nextWeekday(wanted) : wanted
    const last = lastDayOf(first, days, skipWeekends)
    out.push({ id: leaf.id, plannedStart: keyOf(leaf.isMilestone ? last : first), plannedEnd: keyOf(last) })
    endOf.set(leaf.id, last)
    cursor = Math.max(cursor, last + 1)
  }

  // Display order; a leaf whose predecessor is not placed yet waits (a cycle just stops waiting).
  const pending = [...order]
  const inScope = new Set(order.map((o) => o.leaf.id))
  while (pending.length > 0) {
    const waitingOn = new Map(pending.map((o) => [o.leaf.id, predLeaves(o.chain, o.leaf.id).filter((id) => !done.has(id) && inScope.has(id))]))
    let ready = pending.findIndex((o) => waitingOn.get(o.leaf.id)?.length === 0)
    // Nothing is ready only inside a cycle: release the first leaf that (transitively) waits for itself.
    if (ready < 0) ready = Math.max(0, pending.findIndex((o) => waitsForItself(o.leaf.id, waitingOn)))
    place(pending.splice(ready, 1)[0])
  }
  return out
}
