import { createHash } from "node:crypto"
import type { TranslationLocale } from "./types"
import { hasJapanese, isBilingualText } from "@/lib/bilingual-detect"

/**
 * Source-locale detection (pure): hiragana / katakana / CJK ideographs above
 * 15% of all characters → ja, otherwise id.
 */
const JA_CHAR_RE = /[぀-ヿ㐀-鿿ｦ-ﾟ]/g
const JA_RATIO_THRESHOLD = 0.15

export function detectLocale(text: string): TranslationLocale {
  const trimmed = text.trim()
  if (!trimmed) return "id"
  const jaChars = trimmed.match(JA_CHAR_RE)?.length ?? 0
  return jaChars / Math.max(1, trimmed.length) > JA_RATIO_THRESHOLD ? "ja" : "id"
}

/** Identity hash of the source text. Surrounding whitespace is ignored. */
export function sourceHash(text: string): string {
  return createHash("sha256").update(text.trim(), "utf8").digest("hex")
}

export function oppositeLocale(locale: TranslationLocale): TranslationLocale {
  return locale === "ja" ? "id" : "ja"
}

/**
 * Legacy data: the former "併記" feature stored both languages in one column
 * as alternating ID / JA lines. Such text is split into its two sides so it
 * can be registered as an already-translated row instead of being sent to
 * the model as a mixed-language source. Returns null for ordinary text.
 */
export function splitLegacyPairs(text: string): { ja: string; id: string } | null {
  if (!isBilingualText(text)) return null
  const jaLines: string[] = []
  const idLines: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    if (hasJapanese(line)) jaLines.push(line)
    else idLines.push(line)
  }
  if (jaLines.length === 0 || idLines.length === 0) return null
  return { ja: jaLines.join("\n"), id: idLines.join("\n") }
}
