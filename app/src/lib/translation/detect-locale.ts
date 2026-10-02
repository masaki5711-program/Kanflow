import { createHash } from "node:crypto"
import type { TranslationLocale } from "./types"
import { hasJapanese, isBilingualText } from "@/lib/bilingual-detect"

/**
 * Source-locale detection (pure): hiragana / katakana / CJK ideographs above
 * 15% of all characters → ja. Latin text is English when English function
 * words clearly outnumber Indonesian ones, otherwise Indonesian (the factory
 * floor default; also when undecided, e.g. one product code).
 */
const JA_CHAR_RE = /[぀-ヿ㐀-鿿ｦ-ﾟ]/g
const JA_RATIO_THRESHOLD = 0.15

const ID_WORDS = new Set([
  "yang", "dan", "di", "ke", "dari", "untuk", "dengan", "ini", "itu", "tidak", "ada", "akan", "pada", "juga", "sudah",
  "belum", "bisa", "harus", "dalam", "atau", "agar", "karena", "saya", "kami", "kita", "mereka", "sebagai", "oleh",
  "telah", "masih", "perlu", "membuat", "dibuat", "adalah", "seperti", "jika", "maka", "serta", "tersebut", "tolong", "mohon",
])
const EN_WORDS = new Set([
  "the", "and", "to", "of", "is", "are", "for", "with", "this", "that", "be", "will", "on", "in", "not", "have", "has",
  "it", "as", "by", "from", "we", "you", "they", "should", "can", "please", "was", "were", "an", "a", "at", "our", "your",
  "which", "when", "if", "need", "make", "into", "been", "would", "could", "there", "their", "these", "those",
])

/** Latin text: English when its function words win by a clear margin, else Indonesian. */
export function detectLatinLocale(text: string): "id" | "en" {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? []
  let id = 0
  let en = 0
  for (const w of words) {
    if (ID_WORDS.has(w)) id++
    if (EN_WORDS.has(w)) en++
  }
  return en >= 2 && en > id * 1.5 ? "en" : en >= 1 && id === 0 && words.length <= 6 ? "en" : "id"
}

export function detectLocale(text: string): TranslationLocale {
  const trimmed = text.trim()
  if (!trimmed) return "id"
  const jaChars = trimmed.match(JA_CHAR_RE)?.length ?? 0
  if (jaChars / Math.max(1, trimmed.length) > JA_RATIO_THRESHOLD) return "ja"
  return detectLatinLocale(trimmed)
}

/** Two-way JA / ID detection (glossary markup keeps its JA ⇄ ID pairs). */
export function detectJaOrId(text: string): "ja" | "id" {
  return detectLocale(text) === "ja" ? "ja" : "id"
}

/**
 * Languages to translate a source into, in fill order: JA ⇄ ID first (the
 * two working languages of the floor), English last.
 */
export function targetsFor(source: TranslationLocale): TranslationLocale[] {
  if (source === "ja") return ["id", "en"]
  if (source === "id") return ["ja", "en"]
  return ["ja", "id"]
}

/** Identity hash of the source text. Surrounding whitespace is ignored. */
export function sourceHash(text: string): string {
  return createHash("sha256").update(text.trim(), "utf8").digest("hex")
}

/** JA ⇄ ID counterpart (glossary pairs). English maps to Japanese. */
export function oppositeLocale(locale: TranslationLocale): "ja" | "id" {
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
