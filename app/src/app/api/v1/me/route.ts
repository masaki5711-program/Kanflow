import { getMe } from "@/services/api-v1/api-v1.service"
import { v1Route } from "../_lib/v1-route"

/** GET /api/v1/me — the token owner. */
export const GET = v1Route(async ({ principal }) => getMe(principal.userId))
