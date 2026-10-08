/**
 * Where the date pickers of a NEW plan item open. Always "today" made a long
 * schedule need many month clicks; instead the draft starts where the plan
 * already is:
 *  1. the day after the last dated sibling (same parent) ends;
 *  2. else the parent's own start (a dated parent without dated children);
 *  3. else the day after the whole plan ends;
 *  4. else today (nothing is dated yet).
 */
import { addDays } from "./date"
import type { Ymd } from "./plan-types"

interface DraftNode {
  id: string
  parentId: string | null
  plannedStart: Ymd | null
  plannedEnd: Ymd | null
}

/** Latest end among the fully dated rows (YYYY-MM-DD strings compare chronologically). */
function lastEnd(rows: readonly DraftNode[]): Ymd | null {
  let last: Ymd | null = null
  for (const r of rows) {
    if (r.plannedStart && r.plannedEnd && (last === null || r.plannedEnd > last)) last = r.plannedEnd
  }
  return last
}

export function suggestDraftStart(items: readonly DraftNode[], parentId: string | null, today: Ymd): Ymd {
  const siblingEnd = lastEnd(items.filter((i) => i.parentId === parentId))
  if (siblingEnd) return addDays(siblingEnd, 1)
  const parent = parentId ? items.find((i) => i.id === parentId) : undefined
  if (parent?.plannedStart && parent.plannedEnd) return parent.plannedStart
  const planEnd = lastEnd(items)
  return planEnd ? addDays(planEnd, 1) : today
}
