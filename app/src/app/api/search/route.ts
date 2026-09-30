import { requireAuth } from "@/lib/api-helpers"
import { getRateLimiter, retryAfterSeconds } from "@/lib/rate-limit"
import { errorResponse, jsonResponse, toHttpResponse } from "@/services/_shared"
import { searchParamsObject } from "@/services/_shared/cursor"
import { SEARCH_RATE_LIMIT, searchQuerySchema } from "@/services/search/search.schemas"
import { searchEverything } from "@/services/search/search.service"

/**
 * Global search (Ctrl+K palette): `?q=&limit=` → `{ query, groups: [{ type, items }] }`.
 * Only projects the session user can access; trashed rows excluded. q ≥ 2 chars.
 */
export async function GET(request: Request) {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error
  const user = gate.session.user

  const limiter = getRateLimiter("search", SEARCH_RATE_LIMIT)
  const status = limiter.peek(user.id)
  if (status.limited) {
    return errorResponse(429, "Too many requests", "RATE_LIMITED", { headers: { "Retry-After": retryAfterSeconds(status) } })
  }

  limiter.hit(user.id)

  try {
    const query = searchQuerySchema.parse(searchParamsObject(request.url))
    return jsonResponse(await searchEverything({ userId: user.id, systemRole: user.role ?? "member" }, query))
  } catch (error) {
    return toHttpResponse(error, { fallback: "検索に失敗しました", context: "Search" })
  }
}
