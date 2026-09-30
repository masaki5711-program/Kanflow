import { requireAuth } from "@/lib/api-helpers"
import { successResponse, toHttpResponse } from "@/services/_shared"
import { revokeOwnToken } from "@/services/api-tokens/api-tokens.service"

/** DELETE /api/user/api-tokens/:id — revoke one of the caller's tokens (another user's → 404). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error
  const { id } = await params
  try {
    await revokeOwnToken(gate.session.user.id, id)
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "失効に失敗しました", context: "ApiTokens DELETE" })
  }
}
