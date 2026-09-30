/** BCP-47 locale for date formatting in the viewer's UI language. */
export function dateLocale(language: string): string {
  if (language === "ja") return "ja-JP"
  if (language === "id") return "id-ID"
  return "en-US"
}

/** Local-timezone YYYY-MM-DD for `date` (default: today). */
export function toLocalIsoDate(date: Date = new Date()): string {
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${m}-${d}`
}

/**
 * Default date (YYYY-MM-DD) for a new note inside a sprint: today, clamped to
 * [start, end] — so an ended sprint defaults to its last day and a future
 * sprint to its first day (the date input's min/max would reject today).
 * Empty/invalid bounds are ignored.
 */
export function defaultDateInRange(today: string, start: string, end: string): string {
  const iso = /^\d{4}-\d{2}-\d{2}$/
  if (iso.test(end) && today > end) return end
  if (iso.test(start) && today < start) return start
  return today
}
