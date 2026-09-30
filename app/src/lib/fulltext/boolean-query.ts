/**
 * Pure helpers for MySQL FULLTEXT (ngram parser) search — no I/O.
 *
 * The FULLTEXT indexes (migration 20261003010000_fulltext_search) use
 * `WITH PARSER ngram`, so text is indexed as overlapping n-grams of
 * `ngram_token_size` characters (server default 2; checked on the production
 * server 2026-09-30). In BOOLEAN MODE a term longer than the token size is
 * turned into a phrase search of its n-grams — i.e. substring semantics like
 * LIKE '%term%', for Japanese and Latin text alike. A term shorter than the
 * token size cannot be matched reliably, so those queries stay on LIKE.
 */

/** Must equal the server's `ngram_token_size` (read-only; change needs a restart + index rebuild). */
export const NGRAM_TOKEN_SIZE = 2

/** MySQL ER_FT_MATCHING_KEY_NOT_FOUND: "Can't find FULLTEXT index matching the column list". */
export const ER_FT_MATCHING_KEY_NOT_FOUND = 1191

/**
 * Anything that is not a letter, mark or digit separates terms. This removes
 * every boolean-mode operator (`+ - < > ( ) ~ * " @` and `: & |`) and
 * punctuation the MySQL query lexer would otherwise split on unpredictably.
 */
const TERM_SEPARATOR = /[^\p{L}\p{M}\p{N}]+/u

/**
 * User text → a safe BOOLEAN MODE query in which every term is required
 * (`+term*`). Returns null when there is no term, or when any term is shorter
 * than `minTermLength` code points (the caller then uses LIKE).
 * The result is always bound as a query parameter, never interpolated.
 */
export function buildBooleanQuery(raw: string, minTermLength = NGRAM_TOKEN_SIZE): string | null {
  const terms = [...new Set(raw.split(TERM_SEPARATOR).filter((t) => t.length > 0))]
  if (terms.length === 0) return null
  if (terms.some((t) => Array.from(t).length < minTermLength)) return null
  return terms.map((t) => `+${t}*`).join(" ")
}

/** SEARCH_FULLTEXT=on|off (default on). off / false / 0 disables FULLTEXT and keeps LIKE. */
export function isFulltextEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = (env.SEARCH_FULLTEXT ?? "").trim().toLowerCase()
  return !(v === "off" || v === "false" || v === "0")
}

type ErrorLike = {
  errno?: unknown
  message?: unknown
  meta?: { driverAdapterError?: { cause?: { code?: unknown; originalCode?: unknown } } }
}

/**
 * True for MySQL 1191 (the FULLTEXT index is missing — migration not applied),
 * whether it arrives as Prisma's P2010 (driver adapter) or as a raw driver error.
 */
export function isMissingFulltextIndex(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false
  const e = err as ErrorLike
  const cause = e.meta?.driverAdapterError?.cause
  const codes = [cause?.code, cause?.originalCode, e.errno].map((c) => Number(c))
  if (codes.includes(ER_FT_MATCHING_KEY_NOT_FOUND)) return true
  return typeof e.message === "string" && /can't find fulltext index/i.test(e.message)
}
