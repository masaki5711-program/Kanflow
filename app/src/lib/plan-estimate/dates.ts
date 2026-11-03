/** Calendar helpers on "YYYY-MM-DD" keys (UTC day numbers; the engine never looks at a clock). */

const KEY = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MS = 86_400_000

/** Day number of a date key; throws for anything that is not a real calendar date. */
export function dayNumber(key: string): number {
  const m = KEY.exec(key)
  if (!m) throw new Error(`not a date key: ${key}`)
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const t = Date.UTC(y, mo - 1, d)
  const back = new Date(t)
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) throw new Error(`not a date: ${key}`)
  return t / DAY_MS
}

export function dateKeyOf(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10)
}

/**
 * R (plan 12 §3.1, re-review HIGH 3 (c)): the first day of the month of `todayKey` — the day the run is created,
 * in the caller's time zone. Moving the proposed start date never changes R, so the matched set and the weights
 * cannot be swept day by day to isolate one hidden source.
 */
export function referenceDateOf(todayKey: string): string {
  dayNumber(todayKey)
  return `${todayKey.slice(0, 7)}-01`
}

const isWeekend = (day: number) => {
  const w = (((day + 4) % 7) + 7) % 7
  return w === 0 || w === 6
}

/** `days` days after `key` (counting only Monday–Friday with skipWeekends; a weekend start moves first). */
export function addDays(key: string, days: number, skipWeekends: boolean): string {
  let day = dayNumber(key)
  if (!skipWeekends) return dateKeyOf(day + days)
  for (let left = days; left > 0; left--) {
    day++
    while (isWeekend(day)) day++
  }
  return dateKeyOf(day)
}
