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

const keyOf = (day: number) => toDateKey(new Date(day * DAY_MS))

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
export function scheduleFrom(nodes: readonly ScheduleNode[], rootIds: readonly string[] | null, startKey: string): ScheduledDates[] {
  const start = dateFromKey(startKey)
  if (!start) return []
  const kids = childrenIndex(nodes)
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const roots = rootIds === null ? (kids.get(null) ?? []) : rootIds.flatMap((id) => byId.get(id) ?? []).toSorted((a, b) => a.sortOrder - b.sortOrder)
  const out: ScheduledDates[] = []
  const seen = new Set<string>()
  let cursor = dayIndex(start)

  const visit = (node: ScheduleNode): void => {
    if (seen.has(node.id)) return
    seen.add(node.id)
    const children = kids.get(node.id) ?? []
    if (children.length > 0) {
      children.forEach(visit)
      return
    }
    if (node.plannedStart && node.plannedEnd) {
      cursor = Math.max(cursor, dayIndex(dateFromKey(node.plannedEnd) ?? start) + 1)
      return
    }
    const days = Math.max(1, node.durationDays ?? DEFAULT_SCHEDULE_DAYS)
    const last = cursor + days - 1
    out.push({ id: node.id, plannedStart: keyOf(node.isMilestone ? last : cursor), plannedEnd: keyOf(last) })
    cursor += days
  }
  roots.forEach(visit)
  return out
}
