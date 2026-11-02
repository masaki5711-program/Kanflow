/**
 * Pure helpers for the trigram ("fulltext") search path — no I/O.
 *
 * PostgreSQL replaced MySQL's FULLTEXT (ngram) indexes with pg_trgm GIN
 * indexes (migration 0_init, `*_trgm_idx`). They serve `ILIKE '%term%'`, i.e.
 * the same substring semantics the ngram BOOLEAN MODE query had, for
 * Japanese and Latin text alike, case-insensitively; `word_similarity()`
 * ranks the hits (services/search/search.fulltext.ts).
 *
 * User text is split into terms here; every term is bound as a query
 * parameter, never interpolated.
 */

/**
 * Shortest term the trigram path takes. pg_trgm extracts no usable trigram
 * from a term of 1-2 characters, so `ILIKE '%ab%'` cannot use the GIN index
 * and would scan; such queries take the plain LIKE path instead (same scan,
 * but without the word_similarity ranking work, and bounded by the take
 * limits there). Short Japanese terms (「受入」) therefore use LIKE.
 */
export const MIN_TERM_LENGTH = 3

/**
 * Anything that is not a letter, mark or digit separates terms. This removes
 * LIKE wildcards (`%`, `_`), the escape character and every punctuation mark.
 */
const TERM_SEPARATOR = /[^\p{L}\p{M}\p{N}]+/u

/**
 * User text → distinct search terms, all of which a hit must contain.
 * Returns null when there is no term, or when any term is shorter than
 * `minTermLength` code points (the caller then uses LIKE).
 */
export function buildSearchTerms(raw: string, minTermLength = MIN_TERM_LENGTH): string[] | null {
  const terms = [...new Set(raw.split(TERM_SEPARATOR).filter((t) => t.length > 0))]
  if (terms.length === 0) return null
  if (terms.some((t) => Array.from(t).length < minTermLength)) return null
  return terms
}

/** SEARCH_FULLTEXT=on|off (default on). off / false / 0 disables the trigram path and keeps LIKE. */
export function isFulltextEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = (env.SEARCH_FULLTEXT ?? "").trim().toLowerCase()
  return !(v === "off" || v === "false" || v === "0")
}

/** PostgreSQL undefined_function: pg_trgm (word_similarity) is not installed. */
export const PG_UNDEFINED_FUNCTION = "42883"

type ErrorLike = {
  code?: unknown
  message?: unknown
  meta?: { driverAdapterError?: { cause?: { code?: unknown; originalCode?: unknown } } }
}

/**
 * True when the trigram functions are missing (the pg_trgm extension of
 * migration 0_init is not installed): PostgreSQL 42883 naming a similarity
 * function, whether it arrives as Prisma's P2010 (driver adapter) or as a raw
 * driver error. Any other error is a real failure.
 */
export function isMissingTrigramSupport(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false
  const e = err as ErrorLike
  const cause = e.meta?.driverAdapterError?.cause
  const codes = [cause?.code, cause?.originalCode, e.code].map((c) => String(c))
  const message = typeof e.message === "string" ? e.message : ""
  if (!/similarity/i.test(message)) return false
  return codes.includes(PG_UNDEFINED_FUNCTION) || /function \w*similarity\(.*\) does not exist/i.test(message)
}
