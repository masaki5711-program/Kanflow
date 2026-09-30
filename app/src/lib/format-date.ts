import type { Language } from "./i18n"

/**
 * The one place user-facing dates are formatted (A3-14). Every screen uses
 * these helpers so the same sprint reads the same everywhere:
 *
 * | helper            | ja              | en                    | id                  |
 * |-------------------|-----------------|-----------------------|---------------------|
 * | formatShortDate   | 9/8(火)         | Sep 8                 | 8 Sep               |
 * | formatLongDate    | 2026/9/8        | Sep 8, 2026           | 8 Sep 2026          |
 * | formatDateRange   | 2026/8/27 – 2026/9/8 (year: false → 8/27 – 9/8)            |
 * | formatDateTime    | 2026/9/8 14:05  | Sep 8, 2026, 02:05 PM | 8 Sep 2026 14.05    |
 * | formatRelative    | 3 分前          | 3 minutes ago         | 3 menit yang lalu   |
 *
 * Calendar days stored as UTC midnight (sprint / due dates) pass
 * `{ utc: true }` so SSR and browsers in other time zones agree.
 */

/** BCP 47 locale per UI language. */
export const DATE_LOCALE: Readonly<Record<Language, string>> = { ja: "ja-JP", en: "en-US", id: "id-ID" }

type DateInput = string | Date

export interface DateFormatOptions {
  /** Format in UTC (calendar days stored as UTC midnight). Default: viewer's time zone. */
  utc?: boolean
}

export interface ShortDateOptions extends DateFormatOptions {
  /** false drops the weekday (ja "9/8") for dense places such as chart axes. Default true. */
  weekday?: boolean
}

/** Short "day in the year" formats: ja 9/8(火), en Sep 8, id 8 Sep. */
const SHORT: Readonly<Record<Language, Intl.DateTimeFormatOptions>> = {
  ja: { month: "numeric", day: "numeric", weekday: "short" },
  en: { month: "short", day: "numeric" },
  id: { day: "numeric", month: "short" },
}

/** With the year: ja 2026/9/8, en Sep 8, 2026, id 8 Sep 2026. */
const LONG: Readonly<Record<Language, Intl.DateTimeFormatOptions>> = {
  ja: { year: "numeric", month: "numeric", day: "numeric" },
  en: { year: "numeric", month: "short", day: "numeric" },
  id: { day: "numeric", month: "short", year: "numeric" },
}

const TIME: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" }

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(language: Language, kind: string, options: Intl.DateTimeFormatOptions, utc: boolean): Intl.DateTimeFormat {
  const key = `${language}:${kind}:${utc ? "utc" : "local"}`
  const cached = formatters.get(key)
  if (cached) return cached
  const created = new Intl.DateTimeFormat(DATE_LOCALE[language] ?? DATE_LOCALE.ja, utc ? { ...options, timeZone: "UTC" } : options)
  formatters.set(key, created)
  return created
}

/** "2026-10-03" is a calendar day (midnight in the zone it is shown in); anything else is parsed as an instant. */
function toDate(value: DateInput, utc = false): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const [y, m, d] = day ? [Number(day[1]), Number(day[2]) - 1, Number(day[3])] : [0, 0, 0]
  const date = !day ? new Date(value) : utc ? new Date(Date.UTC(y, m, d)) : new Date(y, m, d)
  return Number.isNaN(date.getTime()) ? null : date
}

function lang(language: string): Language {
  return language === "en" || language === "id" ? language : "ja"
}

/**
 * Localized short date (no year) for due dates and similar labels. Returns
 * "" for an invalid date. Avoids hard-coded "M/D", which an Indonesian
 * reader (D/M) misreads.
 */
export function formatShortDate(value: DateInput, language: Language, options: ShortDateOptions = {}): string {
  const date = toDate(value, options.utc)
  if (!date) return ""
  const l = lang(language)
  const withWeekday = options.weekday !== false
  const { weekday, ...withoutWeekday } = SHORT[l]
  const opts = withWeekday && weekday ? SHORT[l] : withoutWeekday
  return formatter(l, withWeekday ? "short-w" : "short", opts, options.utc === true).format(date)
}

/** Localized date with the year (sprint periods, created dates, file dates). "" when invalid. */
export function formatLongDate(value: DateInput, language: Language, options: DateFormatOptions = {}): string {
  const date = toDate(value, options.utc)
  if (!date) return ""
  const l = lang(language)
  return formatter(l, "long", LONG[l], options.utc === true).format(date)
}

export interface DateRangeOptions extends DateFormatOptions {
  /** false → short dates without weekday (timeline labels). Default true. */
  year?: boolean
}

/** "start – end" with one separator everywhere. An invalid side is shown as "…". */
export function formatDateRange(start: DateInput, end: DateInput, language: Language, options: DateRangeOptions = {}): string {
  const one = (v: DateInput) =>
    (options.year === false ? formatShortDate(v, language, { weekday: false, utc: options.utc }) : formatLongDate(v, language, options)) || "…"
  return `${one(start)} – ${one(end)}`
}

/** Localized date + time (hh:mm) for timestamps: tokens, trash, reports. "" when invalid. */
export function formatDateTime(value: DateInput, language: Language, options: DateFormatOptions = {}): string {
  const date = toDate(value, options.utc)
  if (!date) return ""
  const l = lang(language)
  return formatter(l, "datetime", { ...LONG[l], ...TIME }, options.utc === true).format(date)
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY

/** "3 minutes ago" up to a week, then the short date (with the year when it differs). */
export function formatRelative(value: DateInput, now: Date, language: Language): string {
  const date = toDate(value)
  if (!date) return ""
  const l = lang(language)
  const diff = date.getTime() - now.getTime()
  const abs = Math.abs(diff)
  const rtf = new Intl.RelativeTimeFormat(DATE_LOCALE[l], { numeric: "auto" })
  if (abs < MINUTE) return rtf.format(0, "second")
  if (abs < HOUR) return rtf.format(Math.round(diff / MINUTE), "minute")
  if (abs < DAY) return rtf.format(Math.round(diff / HOUR), "hour")
  if (abs < WEEK) return rtf.format(Math.round(diff / DAY), "day")
  return date.getFullYear() === now.getFullYear() ? formatShortDate(date, l, { weekday: false }) : formatLongDate(date, l)
}
