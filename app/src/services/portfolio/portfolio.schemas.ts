import { z } from "zod"
import type { PortfolioFilters } from "./portfolio.types"

/** The aggregate is heavier than a list read: at most 30 per user per minute. */
export const PORTFOLIO_RATE_LIMIT = { limit: 30, windowMs: 60_000 } as const

/** GET /api/portfolio `?section=<id>|none&status=active|archived&attention=1` (all optional). */
export const portfolioQuerySchema = z
  .object({
    section: z.string().max(191).optional(),
    status: z.enum(["active", "archived"]).optional(),
    attention: z.enum(["0", "1"]).optional(),
  })
  .transform((q): PortfolioFilters => ({ section: q.section ?? "", status: q.status ?? "", attentionOnly: q.attention === "1" }))
