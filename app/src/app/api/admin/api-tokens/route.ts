import { requireAdmin } from "@/lib/api-helpers"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { listAllTokens } from "@/services/api-tokens/api-tokens.service"

/** GET /api/admin/api-tokens — every non-revoked personal access token with its owner (admin only). */
export async function GET() {
  const gate = await requireAdmin()
  if ("error" in gate) return gate.error
  try {
    return jsonResponse(await listAllTokens())
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Admin ApiTokens GET" })
  }
}
