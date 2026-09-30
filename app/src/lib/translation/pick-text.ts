import type { EntityI18n, TranslationLocale } from "./types"

/**
 * Decide which text to show for a translatable field (pure, client-safe).
 *
 * - no i18n / no row for the field → original, nothing pending
 * - viewer locale is neither ja nor id (en) → original
 * - the viewer-locale side exists → that text (translated=true when it is
 *   not the source side; `original` carries the source text for hover)
 * - otherwise → original + pending (or failed)
 */
export interface PickedText {
  text: string
  /** Showing the translated side (a different language than the source). */
  translated: boolean
  /** The viewer-locale side is not available yet (pending / running). */
  pending: boolean
  /** Translation gave up (status failed) — original is shown. */
  failed: boolean
  /** Source text for hover when `translated`; otherwise null. */
  original: string | null
}

export function normalizeTextLocale(locale: string): TranslationLocale | null {
  const l = locale.slice(0, 2).toLowerCase()
  if (l === "ja") return "ja"
  if (l === "id") return "id"
  return null
}

export function pickText(
  i18n: EntityI18n | null | undefined,
  field: string,
  original: string | null | undefined,
  locale: string
): PickedText {
  const base = original ?? ""
  const entry = i18n?.[field]
  const want = normalizeTextLocale(locale)
  if (!entry || !want) return { text: base, translated: false, pending: false, failed: false, original: null }

  const candidate = want === "ja" ? entry.ja : entry.id
  if (candidate && candidate.trim().length > 0) {
    if (entry.source === want) {
      return { text: candidate, translated: false, pending: false, failed: false, original: null }
    }
    const sourceText = entry.source === "ja" ? entry.ja : entry.id
    return { text: candidate, translated: true, pending: false, failed: false, original: sourceText ?? base }
  }
  if (entry.source === want) return { text: base, translated: false, pending: false, failed: false, original: null }
  return {
    text: base,
    translated: false,
    pending: entry.status !== "failed",
    failed: entry.status === "failed",
    original: null,
  }
}
