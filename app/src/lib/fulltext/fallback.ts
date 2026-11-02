import { logger } from "@/lib/logger"
import { buildSearchTerms, isFulltextEnabled, isMissingTrigramSupport } from "./search-terms"

const log = logger.child({ module: "search-fulltext" })

/** After a "pg_trgm missing" error, LIKE is used for this long before the trigram path is tried again. */
export const FULLTEXT_RETRY_MS = 10 * 60_000

let pausedUntil = 0
let warned = false

/** Test seam: forget a previous missing-extension pause. */
export function resetFulltextFallback(): void {
  pausedUntil = 0
  warned = false
}

/**
 * Runs `fulltext(terms)` (pg_trgm: ILIKE on trigram-indexed columns, ranked by
 * word_similarity) when it applies, else `like()`.
 *
 * LIKE is used when SEARCH_FULLTEXT=off, when the text yields no terms (or a
 * term shorter than MIN_TERM_LENGTH), when `fulltext` returns null (no
 * candidate at all), and when PostgreSQL reports the trigram functions
 * missing (42883: pg_trgm not installed) — the latter is logged once per
 * process and pauses the trigram path for FULLTEXT_RETRY_MS. Any other error
 * propagates.
 */
export async function withFulltext<T>(
  rawQuery: string,
  fulltext: (terms: readonly string[]) => Promise<T | null>,
  like: () => Promise<T>
): Promise<T> {
  const terms = isFulltextEnabled() ? buildSearchTerms(rawQuery) : null
  if (terms === null || Date.now() < pausedUntil) return like()
  try {
    return (await fulltext(terms)) ?? (await like())
  } catch (err) {
    if (!isMissingTrigramSupport(err)) throw err
    pausedUntil = Date.now() + FULLTEXT_RETRY_MS
    if (!warned) {
      warned = true
      log.warn("pg_trgm functions missing; using LIKE search (apply migration 0_init or set SEARCH_FULLTEXT=off)", {
        retryMs: FULLTEXT_RETRY_MS,
      })
    }
    return like()
  }
}
