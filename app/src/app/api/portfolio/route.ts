import { requireAuth } from "@/lib/api-helpers"
import { getRateLimiter, retryAfterSeconds } from "@/lib/rate-limit"
import { errorResponse, jsonResponse, toHttpResponse } from "@/services/_shared"
import { searchParamsObject } from "@/services/_shared/cursor"
import { PORTFOLIO_RATE_LIMIT, portfolioQuerySchema } from "@/services/portfolio/portfolio.schemas"
import { getPortfolio } from "@/services/portfolio/portfolio.service"
import { filterPortfolio } from "@/services/portfolio/portfolio.types"

/**
 * Department portfolio (same data as the /portfolio page): system admins get
 * every live project, section managers the projects of their sections,
 * everyone else 403. Optional filters: `?section=&status=&attention=1`.
 */
export async function GET(request: Request) {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error
  const user = gate.session.user

  const limiter = getRateLimiter("portfolio", PORTFOLIO_RATE_LIMIT)
  const status = limiter.peek(user.id)
  if (status.limited) {
    return errorResponse(429, "Too many requests", "RATE_LIMITED", { headers: { "Retry-After": retryAfterSeconds(status) } })
  }
  limiter.hit(user.id)

  try {
    const filters = portfolioQuerySchema.parse(searchParamsObject(request.url))
    const portfolio = await getPortfolio({ userId: user.id, systemRole: user.role ?? "member" })
    return jsonResponse({ ...portfolio, rows: filterPortfolio(portfolio.rows, filters) })
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Portfolio" })
  }
}
