/**
 * When the worker may add the English side to rows translated before English
 * existed. Ollama is shared with other apps (BankMasalah), so this low-value
 * catch-up runs only in a quiet window: TRANSLATION_EN_BACKFILL_HOURS =
 *   "19-7"   (default) 19:00 to 07:00 server local time (crosses midnight)
 *   "9-17"   a same-day window
 *   "always" any time   ·   "off" never
 * New and edited text is always translated into every language at once,
 * regardless of this window.
 */
export const DEFAULT_EN_BACKFILL_HOURS = "19-7"

export function parseBackfillWindow(spec: string | undefined): { from: number; to: number } | "always" | "off" {
  const s = (spec ?? DEFAULT_EN_BACKFILL_HOURS).trim().toLowerCase()
  if (s === "always") return "always"
  if (s === "off" || s === "never" || s === "0") return "off"
  const m = /^(\d{1,2})\s*-\s*(\d{1,2})$/.exec(s)
  if (!m) return parseBackfillWindow(DEFAULT_EN_BACKFILL_HOURS)
  const from = Number(m[1])
  const to = Number(m[2])
  if (from > 23 || to > 24) return parseBackfillWindow(DEFAULT_EN_BACKFILL_HOURS)
  return { from, to }
}

/** Pure: is `date` (server local time) inside the window? */
export function inBackfillWindow(spec: string | undefined, date: Date = new Date()): boolean {
  const w = parseBackfillWindow(spec)
  if (w === "always") return true
  if (w === "off") return false
  const h = date.getHours()
  if (w.from === w.to) return true
  return w.from < w.to ? h >= w.from && h < w.to : h >= w.from || h < w.to
}
