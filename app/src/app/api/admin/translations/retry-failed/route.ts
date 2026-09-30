import { requireAdmin } from "@/lib/api-helpers"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { retryFailed } from "@/services/translations-admin/translations-admin.service"

/** Put every `failed` translation row back into the queue (admin only). */
export async function POST() {
  const auth = await requireAdmin()
  if ("error" in auth) return auth.error

  try {
    return jsonResponse(await retryFailed())
  } catch (error) {
    return toHttpResponse(error, { fallback: "再登録に失敗しました", context: "Translation retry" })
  }
}
