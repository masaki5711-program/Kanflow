import { z } from "zod"

/** POST /api/user/api-tokens. `expiresInDays: null` = no expiry (only when API_TOKEN_ALLOW_NO_EXPIRY). */
export const createApiTokenSchema = z.object({
  name: z.string().trim().min(1).max(100),
  expiresInDays: z.union([z.literal(30), z.literal(90), z.literal(365), z.null()]),
})

export type CreateApiTokenInput = z.infer<typeof createApiTokenSchema>
