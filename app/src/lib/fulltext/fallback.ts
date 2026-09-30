import { logger } from "@/lib/logger"
import { buildBooleanQuery, isFulltextEnabled, isMissingFulltextIndex } from "./boolean-query"

const log = logger.child({ module: "search-fulltext" })

/** After a "FULLTEXT index missing" error, LIKE is used for this long before FULLTEXT is tried again. */
export const FULLTEXT_RETRY_MS = 10 * 60_000

let pausedUntil = 0
let warned = false

/** Test seam: forget a previous missing-index pause. */
export function resetFulltextFallback(): void {
  pausedUntil = 0
  warned = false
}

/**
 * Runs `fulltext(booleanQuery)` when FULLTEXT applies, else `like()`.
 *
 * LIKE is used when SEARCH_FULLTEXT=off, when the text yields no FULLTEXT
 * query (a term shorter than ngram_token_size), when `fulltext` returns null
 * (no candidate at all), and when MySQL reports the FULLTEXT index missing
 * (1191: migration not applied yet) — the latter is logged once per process
 * and pauses FULLTEXT for FULLTEXT_RETRY_MS. Any other error propagates.
 */
export async function withFulltext<T>(
  rawQuery: string,
  fulltext: (booleanQuery: string) => Promise<T | null>,
  like: () => Promise<T>
): Promise<T> {
  const booleanQuery = isFulltextEnabled() ? buildBooleanQuery(rawQuery) : null
  if (booleanQuery === null || Date.now() < pausedUntil) return like()
  try {
    return (await fulltext(booleanQuery)) ?? (await like())
  } catch (err) {
    if (!isMissingFulltextIndex(err)) throw err
    pausedUntil = Date.now() + FULLTEXT_RETRY_MS
    if (!warned) {
      warned = true
      log.warn("FULLTEXT index missing; using LIKE search (apply migration 20261003010000_fulltext_search or set SEARCH_FULLTEXT=off)", {
        retryMs: FULLTEXT_RETRY_MS,
      })
    }
    return like()
  }
}
