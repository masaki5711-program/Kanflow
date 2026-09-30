import { requireAdmin } from "@/lib/api-helpers"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { purgeOrphansSchema } from "@/services/translations-admin/translations-admin.schemas"
import { purgeOrphans } from "@/services/translations-admin/translations-admin.service"

/**
 * POST /api/admin/translations/purge-orphans — admin only.
 * Deletes FieldTranslation rows whose entity no longer exists.
 * Body (optional): `{ "dryRun": true }` to only count.
 * Response: `{ dryRun, byEntity: { <entityType>: n }, total }`.
 */
export async function POST(request: Request) {
  const auth = await requireAdmin()
  if ("error" in auth) return auth.error

  try {
    const text = await request.text()
    const input = purgeOrphansSchema.parse(text.trim() ? JSON.parse(text) : {})
    return jsonResponse(await purgeOrphans(input, auth.session.user.id))
  } catch (error) {
    return toHttpResponse(error, { fallback: "削除に失敗しました", context: "Translation orphan purge" })
  }
}
