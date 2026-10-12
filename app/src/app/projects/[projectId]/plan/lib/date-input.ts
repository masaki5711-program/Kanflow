/**
 * Short-hand date entry for the plan's date fields: "+2w", "来週金曜", "月末",
 * "10/20", "2026/10/20" … → "YYYY-MM-DD". Pure; `today` is the Tokyo "today"
 * of the API so the result never depends on the viewer's timezone.
 * Returns null when the text is not understood (the field then shows an error
 * instead of guessing).
 */
import { addBusinessDays } from "@/lib/business-days"
import { addDays, dayParts, dayToYmd, isYmd, isoWeekStartDay, weekdayOfDay, ymdToDay } from "./date"
import type { Ymd } from "./plan-types"

const WEEKDAYS: Record<string, number> = {
  日: 0, 月: 1, 火: 2, 水: 3, 木: 4, 金: 5, 土: 6,
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
  minggu: 0, senin: 1, selasa: 2, rabu: 3, kamis: 4, jumat: 5, sabtu: 6,
}

/** Months: last day / first day / n-th day of the month `offset` months from `today`. */
function monthDay(today: Ymd, offset: number, day: number | "last"): Ymd {
  const p = dayParts(ymdToDay(today))
  const first = Date.UTC(p.year, p.month - 1 + offset, 1)
  const d = new Date(first)
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  const picked = day === "last" ? last : Math.min(day, last)
  return dayToYmd(Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), picked) / 86_400_000))
}

function validYmd(y: number, m: number, d: number): Ymd | null {
  const s = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
  return isYmd(s) ? s : null
}

/** m/d without a year: this year, or next year when it is more than ~6 months in the past. */
function yearless(today: Ymd, m: number, d: number): Ymd | null {
  const year = dayParts(ymdToDay(today)).year
  const thisYear = validYmd(year, m, d)
  if (!thisYear) return null
  return ymdToDay(thisYear) < ymdToDay(today) - 180 ? validYmd(year + 1, m, d) : thisYear
}

function weekdayIndex(token: string): number | null {
  const key = token.replace(/曜日?$/, "").toLowerCase()
  return key in WEEKDAYS ? WEEKDAYS[key] : null
}

/** The given weekday inside the ISO week that is `weeksAhead` weeks from today's. */
function weekdayInWeek(today: Ymd, weeksAhead: number, weekday: number): Ymd {
  const monday = isoWeekStartDay(ymdToDay(today)) + weeksAhead * 7
  return dayToYmd(monday + ((weekday + 6) % 7))
}

/** The first `weekday` strictly after today. */
function nextWeekday(today: Ymd, weekday: number): Ymd {
  const t = ymdToDay(today)
  const ahead = ((weekday - weekdayOfDay(t) + 6) % 7) + 1
  return dayToYmd(t + ahead)
}

function parseAbsolute(s: string, today: Ymd): Ymd | null {
  let m = /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/.exec(s)
  if (m) return validYmd(Number(m[1]), Number(m[2]), Number(m[3]))
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(s)
  if (m) return validYmd(Number(m[1]), Number(m[2]), Number(m[3]))
  // US order m/d/yyyy.
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
  if (m) return validYmd(Number(m[3]), Number(m[1]), Number(m[2]))
  m = /^(\d{1,2})[/.月-](\d{1,2})日?$/.exec(s)
  if (m) return yearless(today, Number(m[1]), Number(m[2]))
  m = /^(\d{1,2})日$/.exec(s)
  if (m) return monthDay(today, 0, Number(m[1]))
  return null
}

const UNIT_DAYS: Record<string, number> = { d: 1, w: 7 }

function parseRelative(s: string, today: Ymd): Ymd | null {
  const m = /^([+-]?)(\d{1,4})(bd|b|d|w|m|y)$/.exec(s)
  if (!m) return null
  const n = (m[1] === "-" ? -1 : 1) * Number(m[2])
  switch (m[3]) {
    case "bd":
    case "b":
      return addBusinessDays(today, n)
    case "d":
    case "w":
      return addDays(today, n * UNIT_DAYS[m[3]])
    case "m":
      return monthDayShift(today, n)
    default:
      return monthDayShift(today, n * 12)
  }
}

/** Same day-of-month `months` later (clamped to the month's last day). */
function monthDayShift(today: Ymd, months: number): Ymd {
  return monthDay(today, months, dayParts(ymdToDay(today)).day)
}

function parseJapaneseRelative(s: string, today: Ymd): Ymd | null {
  const m = /^(\d{1,4})(営業日|日|週間|週|ヶ月|か月|カ月|ヵ月|年)(後|前)$/.exec(s)
  if (!m) return null
  const sign = m[3] === "前" ? -1 : 1
  const n = sign * Number(m[1])
  switch (m[2]) {
    case "営業日": return addBusinessDays(today, n)
    case "日": return addDays(today, n)
    case "週間":
    case "週": return addDays(today, n * 7)
    case "年": return monthDayShift(today, n * 12)
    default: return monthDayShift(today, n)
  }
}

const NAMED: Array<[RegExp, (today: Ymd) => Ymd]> = [
  [/^(今日|きょう|本日|today|hari ?ini)$/, (t) => t],
  [/^(明日|あした|tomorrow|besok)$/, (t) => addDays(t, 1)],
  [/^(明後日|あさって)$/, (t) => addDays(t, 2)],
  [/^(昨日|きのう|yesterday|kemarin)$/, (t) => addDays(t, -1)],
  [/^(今月末|月末|eom)$/, (t) => monthDay(t, 0, "last")],
  [/^(来月末)$/, (t) => monthDay(t, 1, "last")],
  [/^(再来月末)$/, (t) => monthDay(t, 2, "last")],
  [/^(月初|今月初|今月頭)$/, (t) => monthDay(t, 0, 1)],
  [/^(来月初|来月頭|来月)$/, (t) => monthDay(t, 1, 1)],
]

const WEEK_PREFIX: Array<[RegExp, number]> = [
  [/^(今週|this ?)(.+)$/, 0],
  [/^(来週|次週|next ?)(.+)$/, 1],
  [/^(再来週)(.+)$/, 2],
  [/^(先週|last ?)(.+)$/, -1],
]

function parseWeekday(s: string, today: Ymd): Ymd | null {
  for (const [re, ahead] of WEEK_PREFIX) {
    const m = re.exec(s)
    const weekday = m ? weekdayIndex(m[2].trim()) : null
    if (weekday !== null) return weekdayInWeek(today, ahead, weekday)
  }
  const bare = weekdayIndex(s.replace(/^(次の|今度の)/, ""))
  return bare === null ? null : nextWeekday(today, bare)
}

function parseMonthDay(s: string, today: Ymd): Ymd | null {
  const m = /^(来月|再来月|今月)(\d{1,2})日?$/.exec(s)
  if (!m) return null
  const offset = m[1] === "今月" ? 0 : m[1] === "来月" ? 1 : 2
  return monthDay(today, offset, Number(m[2]))
}

/** NFKC folds full-width digits / signs; whitespace inside is dropped except in English phrases ("next fri"). */
function normalize(text: string): string {
  // Excel's "m/d(aaa)" format pastes with a weekday suffix: "10/20(火)".
  return text.normalize("NFKC").trim().toLowerCase().replace(/\s*\([日月火水木金土]\)$/, "")
}

export function parseDateInput(text: string, today: Ymd): Ymd | null {
  const raw = normalize(text)
  if (!raw) return null
  const compact = raw.replace(/\s+/g, "")
  for (const [re, fn] of NAMED) if (re.test(raw) || re.test(compact)) return fn(today)
  return (
    parseAbsolute(compact, today) ??
    parseRelative(compact, today) ??
    parseJapaneseRelative(compact, today) ??
    parseMonthDay(compact, today) ??
    parseWeekday(raw, today) ??
    parseWeekday(compact, today)
  )
}
