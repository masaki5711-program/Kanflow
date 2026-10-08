/**
 * 実績からの日程補正 (pure). When the actual period of a plan item differs from
 * its plan, the rows that come after it can be moved by the same number of
 * days. Dates are "YYYY-MM-DD" strings; arithmetic runs on UTC day numbers.
 */
import { dateFromKey, dayIndex } from "@/lib/plan-progress"

const DAY_MS = 86_400_000

export type ShiftScope = "dependents" | "later"

export interface ShiftNode {
  id: string
  parentId: string | null
  plannedStart: string | null
  plannedEnd: string | null
  actualStart: string | null
  actualEnd: string | null
  status: string
}

export interface ShiftMove {
  id: string
  plannedStart: string
  plannedEnd: string
  newStart: string
  newEnd: string
}

export type SkipReason = "undated" | "started" | "done"

export interface ShiftResult {
  moved: ShiftMove[]
  skipped: Array<{ id: string; reason: SkipReason }>
}

const dayOf = (key: string): number => dayIndex(dateFromKey(key) as Date)
const keyOf = (day: number): string => new Date(day * DAY_MS).toISOString().slice(0, 10)

/**
 * How many days the actuals are off the plan: the actual end - the planned end
 * once finished, else the actual start - the planned start. Null when there is
 * nothing to compare (positive = later than planned).
 */
export function slipDays(n: Pick<ShiftNode, "plannedStart" | "plannedEnd" | "actualStart" | "actualEnd">): number | null {
  if (n.actualEnd && n.plannedEnd) return dayOf(n.actualEnd) - dayOf(n.plannedEnd)
  if (n.actualStart && n.plannedStart) return dayOf(n.actualStart) - dayOf(n.plannedStart)
  return null
}

function ancestorsOf(byId: ReadonlyMap<string, ShiftNode>, id: string): Set<string> {
  const out = new Set<string>()
  let cur = byId.get(id)?.parentId ?? null
  while (cur && !out.has(cur)) {
    out.add(cur)
    cur = byId.get(cur)?.parentId ?? null
  }
  return out
}

function successorsOf(deps: ReadonlyArray<{ predecessorId: string; successorId: string }>, from: string): Set<string> {
  const next = new Map<string, string[]>()
  for (const d of deps) next.set(d.predecessorId, [...(next.get(d.predecessorId) ?? []), d.successorId])
  const seen = new Set<string>()
  const queue = [...(next.get(from) ?? [])]
  while (queue.length > 0) {
    const cur = queue.shift() as string
    if (seen.has(cur)) continue
    seen.add(cur)
    queue.push(...(next.get(cur) ?? []))
  }
  return seen
}

function subtreeOf(children: ReadonlyMap<string, string[]>, id: string): Set<string> {
  const out = new Set<string>()
  const stack = [id]
  while (stack.length > 0) {
    const cur = stack.pop() as string
    if (out.has(cur)) continue
    out.add(cur)
    stack.push(...(children.get(cur) ?? []))
  }
  return out
}

/**
 * The leaf rows to move by `delta` days when `sourceId` slipped. `dependents`
 * = everything reached over its dependencies; `later` = every dated row that
 * starts after the source's planned end. Finished / started / undated rows
 * never move (reported in `skipped`). Parents are not moved: their span is
 * derived from the leaves.
 */
export function planShift(
  nodes: readonly ShiftNode[],
  deps: ReadonlyArray<{ predecessorId: string; successorId: string }>,
  sourceId: string,
  scope: ShiftScope,
  delta: number
): ShiftResult {
  const result: ShiftResult = { moved: [], skipped: [] }
  const source = nodes.find((n) => n.id === sourceId)
  if (!source || delta === 0) return result

  const byId = new Map(nodes.map((n) => [n.id, n]))
  const children = new Map<string, string[]>()
  for (const n of nodes) if (n.parentId) children.set(n.parentId, [...(children.get(n.parentId) ?? []), n.id])
  const blocked = new Set([...subtreeOf(children, sourceId), ...ancestorsOf(byId, sourceId)])

  let picked: Set<string>
  if (scope === "dependents") {
    picked = new Set()
    for (const id of successorsOf(deps, sourceId)) for (const sub of subtreeOf(children, id)) picked.add(sub)
  } else {
    const after = source.plannedEnd ? dayOf(source.plannedEnd) : null
    picked = new Set(nodes.filter((n) => after !== null && n.plannedStart !== null && dayOf(n.plannedStart) > after).map((n) => n.id))
  }

  for (const n of nodes) {
    if (!picked.has(n.id) || blocked.has(n.id) || children.has(n.id)) continue
    if (!n.plannedStart || !n.plannedEnd) result.skipped.push({ id: n.id, reason: "undated" })
    else if (n.status === "done" || n.actualEnd) result.skipped.push({ id: n.id, reason: "done" })
    else if (n.actualStart) result.skipped.push({ id: n.id, reason: "started" })
    else {
      result.moved.push({
        id: n.id,
        plannedStart: n.plannedStart,
        plannedEnd: n.plannedEnd,
        newStart: keyOf(dayOf(n.plannedStart) + delta),
        newEnd: keyOf(dayOf(n.plannedEnd) + delta),
      })
    }
  }
  return result
}
