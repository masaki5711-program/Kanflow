import { z } from "zod"
import { API_TOKEN_SCOPES } from "@/lib/api-tokens/scopes"
import { API_TOKEN_MAX_PROJECTS } from "@/lib/api-tokens/token"

/**
 * POST /api/user/api-tokens. `expiresInDays: null` = no expiry (only when API_TOKEN_ALLOW_NO_EXPIRY).
 * `scopes` defaults to read-only (`read` is always added); `projectIds`
 * omitted / null = every project the owner can access, [] = 400.
 */
export const createApiTokenSchema = z.object({
  name: z.string().trim().min(1).max(100),
  expiresInDays: z.union([z.literal(30), z.literal(90), z.literal(365), z.null()]),
  scopes: z.array(z.enum(API_TOKEN_SCOPES)).max(API_TOKEN_SCOPES.length * 2).optional(),
  // [] is refused rather than read as "no restriction": a caller meaning "no projects" must not get all of them.
  projectIds: z.array(z.string().trim().min(1).max(191)).min(1).max(API_TOKEN_MAX_PROJECTS).nullable().optional(),
})

export type CreateApiTokenInput = z.infer<typeof createApiTokenSchema>
