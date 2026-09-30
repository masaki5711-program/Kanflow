/**
 * The plan's single date model: calendar dates are "YYYY-MM-DD" strings and
 * all arithmetic runs on UTC day numbers (days since 1970-01-01). No local
 * time getters are used, so results never depend on the viewer's timezone.
 */
import type { Ymd } from "./plan-types"

const MS_PER_DAY = 86_400_000
const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})/

/** Parts of a date string; accepts "YYYY-MM-DD" and ISO timestamps (date part only). */
function parts(value: string): [number, number, number] | null {
  const m = YMD_RE.exec(value)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  // Reject overflow such as 2026-02-30.
  const check = new Date(Date.UTC(y, mo - 1, d))
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null
  return [y, mo, d]
}

export function isYmd(value: unknown): value is Ymd {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && parts(value) !== null
}

/** Normalise an API value to "YYYY-MM-DD" (null for empty/invalid). */
export function toYmd(value: string | null | undefined): Ymd | null {
  if (!value) return null
  const p = parts(value)
  if (!p) return null
  return `${p[0]}-${String(p[1]).padStart(2, "0")}-${String(p[2]).padStart(2, "0")}`
}

/** UTC day number of a date string (throws on an invalid value: callers normalise first). */
export function ymdToDay(ymd: Ymd): number {
  const p = parts(ymd)
  if (!p) throw new RangeError(`invalid date: ${ymd}`)
  return Math.round(Date.UTC(p[0], p[1] - 1, p[2]) / MS_PER_DAY)
}

export function dayToYmd(day: number): Ymd {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10)
}

export function addDays(ymd: Ymd, n: number): Ymd {
  return dayToYmd(ymdToDay(ymd) + n)
}

/** b - a in days. */
export function diffDays(a: Ymd, b: Ymd): number {
  return ymdToDay(b) - ymdToDay(a)
}

/** Inclusive length of a range: a single-day item lasts 1 day. */
export function spanDays(start: Ymd, end: Ymd): number {
  return diffDays(start, end) + 1
}

/** 0 = Sunday … 6 = Saturday (1970-01-01 was a Thursday). */
export function weekdayOfDay(day: number): number {
  return (((day + 4) % 7) + 7) % 7
}

export function isWeekendDay(day: number): boolean {
  const w = weekdayOfDay(day)
  return w === 0 || w === 6
}

/** Monday of the ISO week containing `day`. */
export function isoWeekStartDay(day: number): number {
  return day - ((weekdayOfDay(day) + 6) % 7)
}

export interface DayParts {
  year: number
  /** 1-12 */
  month: number
  day: number
}

export function dayParts(day: number): DayParts {
  const d = new Date(day * MS_PER_DAY)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

export function monthStartDay(day: number): number {
  const p = dayParts(day)
  return Math.round(Date.UTC(p.year, p.month - 1, 1) / MS_PER_DAY)
}

export function nextMonthStartDay(day: number): number {
  const p = dayParts(day)
  return Math.round(Date.UTC(p.year, p.month, 1) / MS_PER_DAY)
}

export function quarterStartDay(day: number): number {
  const p = dayParts(day)
  return Math.round(Date.UTC(p.year, Math.floor((p.month - 1) / 3) * 3, 1) / MS_PER_DAY)
}

export function yearStartDay(day: number): number {
  return Math.round(Date.UTC(dayParts(day).year, 0, 1) / MS_PER_DAY)
}

/** The viewer's calendar date (fallback when the API did not send `today`). */
export function localTodayYmd(now: Date = new Date()): Ymd {
  // en-CA formats as YYYY-MM-DD in the runtime's own timezone.
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(now)
}

export function clampDay(day: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, day))
}
