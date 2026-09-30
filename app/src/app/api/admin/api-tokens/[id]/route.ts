import { requireAdmin } from "@/lib/api-helpers"
import { successResponse, toHttpResponse } from "@/services/_shared"
import { revokeTokenAsAdmin } from "@/services/api-tokens/api-tokens.service"

/** DELETE /api/admin/api-tokens/:id — revoke any user's token (admin only). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin()
  if ("error" in gate) return gate.error
  const { id } = await params
  try {
    await revokeTokenAsAdmin(gate.session.user.id, id)
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "失効に失敗しました", context: "Admin ApiTokens DELETE" })
  }
}
