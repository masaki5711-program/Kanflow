import type { Language } from "./i18n"

/** BCP 47 locale per UI language. */
export const DATE_LOCALE: Readonly<Record<Language, string>> = { ja: "ja-JP", en: "en-US", id: "id-ID" }

/** Short "day in the year" formats: ja 9/8(火), en Sep 8, id 8 Sep. */
const SHORT_DATE_OPTIONS: Readonly<Record<Language, Intl.DateTimeFormatOptions>> = {
  ja: { month: "numeric", day: "numeric", weekday: "short" },
  en: { month: "short", day: "numeric" },
  id: { day: "numeric", month: "short" },
}

export interface ShortDateOptions {
  /** false drops the weekday (ja "9/8") for dense places such as chart axes. Default true. */
  weekday?: boolean
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(language: Language, withWeekday: boolean): Intl.DateTimeFormat {
  const key = `${language}:${withWeekday ? "w" : "-"}`
  const cached = formatters.get(key)
  if (cached) return cached
  const base = SHORT_DATE_OPTIONS[language] ?? SHORT_DATE_OPTIONS.ja
  const { weekday, ...withoutWeekday } = base
  const options = withWeekday && weekday ? base : withoutWeekday
  const created = new Intl.DateTimeFormat(DATE_LOCALE[language] ?? DATE_LOCALE.ja, options)
  formatters.set(key, created)
  return created
}

/**
 * Localized short date (no year) for due dates and similar labels, in the
 * viewer's local time zone. Returns "" for an invalid date.
 * Avoids hard-coded "M/D", which an Indonesian reader (D/M) misreads.
 */
export function formatShortDate(value: string | Date, language: Language, options: ShortDateOptions = {}): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return formatterFor(language, options.weekday !== false).format(date)
}
