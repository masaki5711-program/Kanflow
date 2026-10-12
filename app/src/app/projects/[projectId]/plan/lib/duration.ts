/**
 * Duration ⇄ end-date arithmetic of the plan editor. A duration is inclusive
 * (a one-day item lasts 1 day). With `business` the days are business days
 * (no weekends / Japanese holidays, see lib/business-days.ts).
 */
import { businessDaysBetween, endOfBusinessSpan, nextBusinessDay } from "@/lib/business-days"
import { addDays, diffDays, spanDays } from "./date"
import type { Ymd } from "./plan-types"

export function durationOf(start: Ymd, end: Ymd, business: boolean): number {
  return business ? Math.max(1, businessDaysBetween(start, end)) : spanDays(start, end)
}

export function endFromDuration(start: Ymd, days: number, business: boolean): Ymd {
  const n = Math.max(1, Math.trunc(days))
  return business ? endOfBusinessSpan(start, n) : addDays(start, n - 1)
}

/**
 * The end that keeps the old duration when the start moves. Calendar mode
 * keeps the calendar length; business mode keeps the business-day count.
 */
export function endKeepingDuration(oldStart: Ymd, oldEnd: Ymd, newStart: Ymd, business: boolean): Ymd {
  if (business) return endFromDuration(newStart, durationOf(oldStart, oldEnd, true), true)
  return addDays(newStart, diffDays(oldStart, oldEnd))
}

/** A start that is not a business day is moved to the next one (business mode only). */
export function snapStart(start: Ymd, business: boolean): Ymd {
  return business ? nextBusinessDay(start) : start
}
