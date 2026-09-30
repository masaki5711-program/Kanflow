/**
 * Relative timestamps ("3 minutes ago") via Intl.RelativeTimeFormat — pure,
 * locale-aware, no translation keys. Older than a week → a short date.
 */
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY

const LOCALES: Record<string, string> = { ja: "ja-JP", en: "en-US", id: "id-ID" }

export function localeOf(language: string): string {
  return LOCALES[language] ?? language
}

export function formatRelativeTime(iso: string, now: Date, language: string): string {
  const then = new Date(iso)
  if (isNaN(then.getTime())) return ""
  const locale = localeOf(language)
  const diff = then.getTime() - now.getTime()
  const abs = Math.abs(diff)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" })
  if (abs < MINUTE) return rtf.format(0, "second")
  if (abs < HOUR) return rtf.format(Math.round(diff / MINUTE), "minute")
  if (abs < DAY) return rtf.format(Math.round(diff / HOUR), "hour")
  if (abs < WEEK) return rtf.format(Math.round(diff / DAY), "day")
  const sameYear = then.getFullYear() === now.getFullYear()
  return then.toLocaleDateString(locale, sameYear ? { month: "short", day: "numeric" } : { year: "numeric", month: "short", day: "numeric" })
}

/** Full date-time for tooltips / `<time title>`. */
export function formatFullDateTime(iso: string, language: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? "" : d.toLocaleString(localeOf(language))
}
