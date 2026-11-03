/**
 * Name similarity with the same definition as PostgreSQL pg_trgm `similarity()` (plan 12 §3.1 stages 3–4),
 * so the pure engine and an SQL pre-filter agree:
 *  - lower-case; words are runs of letters / digits (any script, so Japanese names work);
 *  - each word is padded with two spaces in front and one behind, and cut into 3-character trigrams;
 *  - similarity = |A ∩ B| / |A ∪ B| over the trigram sets (0 when either side has none).
 */

const WORD = /[\p{L}\p{N}]+/gu

export function trigrams(text: string): Set<string> {
  const out = new Set<string>()
  for (const word of text.toLowerCase().match(WORD) ?? []) {
    const chars = Array.from(`  ${word} `)
    for (let i = 0; i + 3 <= chars.length; i++) out.add(chars.slice(i, i + 3).join(""))
  }
  return out
}

export function trigramSimilarity(a: string, b: string): number {
  const ta = trigrams(a)
  const tb = trigrams(b)
  if (ta.size === 0 || tb.size === 0) return 0
  let shared = 0
  for (const t of ta) if (tb.has(t)) shared++
  return shared / (ta.size + tb.size - shared)
}
