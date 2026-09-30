import { z } from "zod"
import { normalizeQuery, SEARCH_QUERY_MAX, SEARCH_QUERY_MIN } from "./search.query"

export const SEARCH_LIMIT_DEFAULT = 5
export const SEARCH_LIMIT_MAX = 10

/** Per-user budget of /api/search: the palette debounces (200 ms), so this only stops scripted abuse. */
export const SEARCH_RATE_LIMIT = { limit: 120, windowMs: 60_000 } as const

/** GET /api/search?q=&limit= — `limit` is per result type. */
export const searchQuerySchema = z.object({
  q: z
    .string()
    .transform(normalizeQuery)
    .pipe(z.string().min(SEARCH_QUERY_MIN).max(SEARCH_QUERY_MAX)),
  limit: z.coerce.number().int().min(1).max(SEARCH_LIMIT_MAX).default(SEARCH_LIMIT_DEFAULT),
})

export type SearchQuery = z.infer<typeof searchQuerySchema>
