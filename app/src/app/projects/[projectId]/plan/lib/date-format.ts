/**
 * Localized date labels for the plan (Intl, always in UTC so a "YYYY-MM-DD"
 * string renders as the same calendar day everywhere).
 *   ja: 10/01(木)   en: Oct 1 (Thu)   id: 1 Okt (Kam)
 */
import type { Language } from "@/lib/i18n"
import { dayParts, ymdToDay } from "./date"
import type { Ymd } from "./plan-types"

const LOCALE: Record<Language, string> = { ja: "ja-JP", en: "en-US", id: "id-ID" }
const MS_PER_DAY = 86_400_000

const cache = new Map<string, Intl.DateTimeFormat>()
function fmt(language: Language, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${language}|${JSON.stringify(options)}`
  let f = cache.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat(LOCALE[language], { ...options, timeZone: "UTC" })
    cache.set(key, f)
  }
  return f
}

const dateOf = (day: number) => new Date(day * MS_PER_DAY)
const pad2 = (n: number) => String(n).padStart(2, "0")

export function weekdayShort(day: number, language: Language): string {
  return fmt(language, { weekday: "short" }).format(dateOf(day))
}

export function weekdayInitial(day: number, language: Language): string {
  return fmt(language, { weekday: "narrow" }).format(dateOf(day))
}

export function monthShort(day: number, language: Language): string {
  return fmt(language, { month: "short" }).format(dateOf(day))
}

/** Month + day without weekday: ja 10/6 · en Oct 6 · id 6 Okt. */
export function formatMonthDay(day: number, language: Language): string {
  const p = dayParts(day)
  if (language === "ja") return `${p.month}/${p.day}`
  if (language === "en") return `${monthShort(day, language)} ${p.day}`
  return `${p.day} ${monthShort(day, language)}`
}

/** Compact date with weekday for grid cells and tooltips. */
export function formatShortDate(ymd: Ymd, language: Language): string {
  const day = ymdToDay(ymd)
  const p = dayParts(day)
  const wd = weekdayShort(day, language)
  if (language === "ja") return `${pad2(p.month)}/${pad2(p.day)}(${wd})`
  return `${formatMonthDay(day, language)} (${wd})`
}

/** Full date for aria labels and titles. */
export function formatFullDate(ymd: Ymd, language: Language): string {
  return fmt(language, { dateStyle: "full" }).format(dateOf(ymdToDay(ymd)))
}

/** Month header label: ja 2026年10月 · en October 2026 · id Oktober 2026. */
export function formatMonthYear(day: number, language: Language): string {
  return fmt(language, { year: "numeric", month: "long" }).format(dateOf(day))
}

export function formatYear(day: number, language: Language): string {
  return fmt(language, { year: "numeric" }).format(dateOf(day))
}

/** Grid date cell: ja keeps the weekday (10/01(木)); en / id drop it so the cell never wraps (Oct 1 · 1 Okt). */
export function formatGridDate(ymd: Ymd, language: Language): string {
  return language === "ja" ? formatShortDate(ymd, language) : formatMonthDay(ymdToDay(ymd), language)
}

/**
 * Compact inclusive range for the grid's period column:
 *   ja 10/01–10/07 · en Oct 1–7 / Oct 28–Nov 3 · id 1–7 Okt / 28 Okt–3 Nov.
 * The year is added only when the range crosses a year boundary.
 */
export function formatCompactRange(start: Ymd, end: Ymd, language: Language): string {
  const s = ymdToDay(start)
  const e = ymdToDay(end)
  if (e <= s) return formatShortDate(start, language)
  const a = dayParts(s)
  const b = dayParts(e)
  const sameYear = a.year === b.year
  if (language === "ja") {
    const md = (p: { month: number; day: number }) => `${pad2(p.month)}/${pad2(p.day)}`
    return sameYear ? `${md(a)}–${md(b)}` : `${a.year}/${md(a)}–${b.year}/${md(b)}`
  }
  if (!sameYear) {
    const full = (day: number, p: { year: number }) => (language === "en" ? `${formatMonthDay(day, language)}, ${p.year}` : `${formatMonthDay(day, language)} ${p.year}`)
    return `${full(s, a)}–${full(e, b)}`
  }
  if (a.month === b.month) {
    return language === "en" ? `${formatMonthDay(s, language)}–${b.day}` : `${a.day}–${formatMonthDay(e, language)}`
  }
  return `${formatMonthDay(s, language)}–${formatMonthDay(e, language)}`
}
