/**
 * Small pure helpers shared by the P3 chat tool packs
 * (analysis-tools-planning / -history / -portfolio, proposal-tools).
 * analysis-tools.ts keeps its own private copies (P3-c edits that file).
 */

export const DAY_MS = 86_400_000

export const now = (): Date => new Date()

/** YYYY-MM-DD (UTC). */
export const iso = (d: Date): string => d.toISOString().slice(0, 10)

/** Collapse whitespace and cut to `max` chars (with an ellipsis). */
export function trunc(s: string | null | undefined, max: number): string {
  if (!s) return ""
  const t = s.trim().replace(/\s+/g, " ")
  return t.length <= max ? t : t.slice(0, max) + "…"
}

/** Whole days from `from` to `to` (floored; negative when `to` is earlier). */
export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS)
}

/** Integer argument clamped to [min, max]; `fallback` when missing / not a number. */
export function intArg(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(Math.trunc(n), min), max)
}

/** Trimmed string argument, or undefined when missing / blank / not a string. */
export function strArg(value: unknown, max = 200): string | undefined {
  if (typeof value !== "string") return undefined
  const t = value.trim()
  return t ? t.slice(0, max) : undefined
}

/** "#12" / "12" / 12 → 12; anything else → null. */
export function parseDisplayId(value: unknown): number | null {
  if (typeof value === "number") return Number.isInteger(value) && value > 0 ? value : null
  if (typeof value !== "string") return null
  const m = value.trim().match(/^#?(\d{1,9})$/)
  return m ? Number(m[1]) : null
}

export const pct = (part: number, whole: number): number | null =>
  whole > 0 ? Math.round((part / whole) * 100) : null

export const round1 = (n: number): number => Math.round(n * 10) / 10

/** Is a sprint task a real task (the PBI placeholder row has a blank name)? */
export const isRealTask = (t: { taskName: string | null }): boolean => (t.taskName ?? "").trim().length > 0

/** NFKC + lower case + no whitespace / punctuation — the basis of title similarity. */
export function normalizeTitle(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "")
}

function bigrams(s: string): Map<string, number> {
  const out = new Map<string, number>()
  if (s.length === 1) out.set(s, 1)
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2)
    out.set(g, (out.get(g) ?? 0) + 1)
  }
  return out
}

/**
 * Sørensen–Dice coefficient over character bigrams of the normalized titles
 * (0..1). Character-based so it works for Japanese / Indonesian / English
 * alike without a tokenizer.
 */
export function titleSimilarity(a: string, b: string): number {
  const x = normalizeTitle(a)
  const y = normalizeTitle(b)
  if (!x || !y) return 0
  if (x === y) return 1
  const gx = bigrams(x)
  const gy = bigrams(y)
  let overlap = 0
  let total = 0
  for (const [g, n] of gx) {
    overlap += Math.min(n, gy.get(g) ?? 0)
    total += n
  }
  for (const n of gy.values()) total += n
  return total > 0 ? (2 * overlap) / total : 0
}

export interface Titled {
  key: string
  title: string
}

export interface SimilarPair {
  a: string
  b: string
  similarity: number
}

/**
 * Pure: pairs of items whose titles are at least `threshold` similar, most
 * similar first, capped at `limit`. O(n²) — callers cap n (≤ 200).
 */
export function findSimilarPairs(items: readonly Titled[], threshold = 0.6, limit = 10): SimilarPair[] {
  const pairs: SimilarPair[] = []
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const s = titleSimilarity(items[i].title, items[j].title)
      if (s >= threshold) pairs.push({ a: items[i].key, b: items[j].key, similarity: Math.round(s * 100) / 100 })
    }
  }
  return pairs.sort((p, q) => q.similarity - p.similarity).slice(0, limit)
}

/** Pure: the `limit` items most similar to `title` (≥ threshold), most similar first. */
export function mostSimilar<T extends Titled>(title: string, items: readonly T[], threshold = 0.6, limit = 3): Array<T & { similarity: number }> {
  return items
    .map((it) => ({ ...it, similarity: Math.round(titleSimilarity(title, it.title) * 100) / 100 }))
    .filter((it) => it.similarity >= threshold)
    .sort((p, q) => q.similarity - p.similarity)
    .slice(0, limit)
}
