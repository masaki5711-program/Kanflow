/**
 * 営業日 (business days) for the master plan — pure, shared by the client
 * (duration input, bulk shift) and the server (bulk shift, reflow).
 * A business day is not a Saturday / Sunday and not a Japanese national
 * holiday (振替休日 and 国民の休日 included). Dates are "YYYY-MM-DD" strings;
 * arithmetic runs on UTC day numbers, so nothing depends on the timezone.
 * Holiday rules are valid for 2023 and later (the Olympic-year moves of
 * 2020-2022 are not modelled).
 */

const DAY_MS = 86_400_000
/** Guard for loops over a pathological `n`. */
const MAX_STEPS = 20_000

const toDay = (ymd: string): number => {
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS)
}
const toYmd = (day: number): string => new Date(day * DAY_MS).toISOString().slice(0, 10)
/** 0 = Sunday … 6 = Saturday. */
const weekdayOf = (day: number): number => (((day + 4) % 7) + 7) % 7
const dayOfDate = (y: number, m: number, d: number): number => Math.round(Date.UTC(y, m - 1, d) / DAY_MS)

/** n-th (1-based) Monday of a month. */
function nthMonday(y: number, m: number, n: number): number {
  const first = dayOfDate(y, m, 1)
  return first + ((8 - weekdayOf(first)) % 7) + (n - 1) * 7
}

const springEquinox = (y: number): number => Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4))
const autumnEquinox = (y: number): number => Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4))

const holidayCache = new Map<number, ReadonlySet<number>>()

/** Day numbers of every Japanese holiday (incl. substitute / sandwiched days) of a year. */
function holidaysOf(y: number): ReadonlySet<number> {
  const cached = holidayCache.get(y)
  if (cached) return cached
  const base = new Set<number>([
    dayOfDate(y, 1, 1),
    nthMonday(y, 1, 2),
    dayOfDate(y, 2, 11),
    dayOfDate(y, 2, 23),
    dayOfDate(y, 3, springEquinox(y)),
    dayOfDate(y, 4, 29),
    dayOfDate(y, 5, 3),
    dayOfDate(y, 5, 4),
    dayOfDate(y, 5, 5),
    nthMonday(y, 7, 3),
    dayOfDate(y, 8, 11),
    nthMonday(y, 9, 3),
    dayOfDate(y, 9, autumnEquinox(y)),
    nthMonday(y, 10, 2),
    dayOfDate(y, 11, 3),
    dayOfDate(y, 11, 23),
  ])
  const all = new Set(base)
  // 国民の休日: a normal day sandwiched between two holidays.
  for (const d of base) if (base.has(d + 2) && !base.has(d + 1) && weekdayOf(d + 1) !== 0) all.add(d + 1)
  // 振替休日: a holiday on Sunday moves to the next day that is not a holiday.
  for (const d of [...all].sort((a, b) => a - b)) {
    if (weekdayOf(d) !== 0) continue
    let next = d + 1
    while (all.has(next)) next += 1
    all.add(next)
  }
  holidayCache.set(y, all)
  return all
}

export function isJapaneseHoliday(ymd: string): boolean {
  const day = toDay(ymd)
  return holidaysOf(new Date(day * DAY_MS).getUTCFullYear()).has(day)
}

export function isBusinessDay(ymd: string): boolean {
  const day = toDay(ymd)
  const w = weekdayOf(day)
  return w !== 0 && w !== 6 && !holidaysOf(new Date(day * DAY_MS).getUTCFullYear()).has(day)
}

const isBusinessDayNumber = (day: number): boolean => isBusinessDay(toYmd(day))

/** The date itself when it is a business day, else the next business day. */
export function nextBusinessDay(ymd: string): string {
  let day = toDay(ymd)
  for (let i = 0; i < MAX_STEPS && !isBusinessDayNumber(day); i += 1) day += 1
  return toYmd(day)
}

/** Moves `n` business days (negative = back). A non-business start counts from the nearest business day in the direction of travel. */
export function addBusinessDays(ymd: string, n: number): string {
  let day = toDay(ymd)
  const step = n < 0 ? -1 : 1
  let left = Math.min(Math.abs(Math.trunc(n)), MAX_STEPS)
  while (left > 0) {
    day += step
    if (isBusinessDayNumber(day)) left -= 1
  }
  return toYmd(day)
}

/** Business days in the inclusive range [start, end] (0 when end < start). */
export function businessDaysBetween(start: string, end: string): number {
  const from = toDay(start)
  const to = toDay(end)
  let count = 0
  for (let d = from; d <= to && d - from < MAX_STEPS; d += 1) if (isBusinessDayNumber(d)) count += 1
  return count
}

/** The last day of an `n`-business-day span starting at `start` (n >= 1; the start is the first day, moved to a business day when it is not one only for counting). */
export function endOfBusinessSpan(start: string, n: number): string {
  const first = nextBusinessDay(start)
  return n <= 1 ? first : addBusinessDays(first, n - 1)
}
