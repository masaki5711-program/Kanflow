import { requireAuth } from "@/lib/api-helpers"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { createApiTokenSchema } from "@/services/api-tokens/api-tokens.schemas"
import { createOwnToken, getOwnTokens } from "@/services/api-tokens/api-tokens.service"

/** GET /api/user/api-tokens — the caller's personal access tokens, the token settings and the projects a token can be limited to. */
export async function GET() {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error
  try {
    return jsonResponse(await getOwnTokens({ id: gate.session.user.id, role: gate.session.user.role ?? "member" }))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "ApiTokens GET" })
  }
}

/**
 * POST /api/user/api-tokens `{ name, expiresInDays: 30 | 90 | 365 | null, scopes?, projectIds? }` →
 * 201 with the plain `token` (shown once). 403 disabled, 400 no expiry not
 * allowed / unknown project, 409 per-user limit reached.
 */
export async function POST(request: Request) {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error
  try {
    const input = createApiTokenSchema.parse(await request.json())
    return jsonResponse(await createOwnToken(gate.session.user.id, input), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "作成に失敗しました", context: "ApiTokens POST" })
  }
}
