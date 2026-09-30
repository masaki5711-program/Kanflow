import { requireAuth } from "@/lib/api-helpers"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { updatePreferencesSchema } from "@/services/notifications/notifications.schemas"
import { getNotificationPreferences, updateNotificationPreferences } from "@/services/notifications/notifications.service"

/** `{ preferences: [{ type, enabled }] }` for every notification type (default enabled). */
export async function GET() {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error

  try {
    return jsonResponse(await getNotificationPreferences(gate.session.user.id))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Notification PREFS GET" })
  }
}

/** Body `{ preferences: [{ type, enabled }] }` (only listed types change) → the full list. */
export async function PUT(request: Request) {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error

  try {
    const input = updatePreferencesSchema.parse(await request.json())
    return jsonResponse(await updateNotificationPreferences(gate.session.user.id, input))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "Notification PREFS PUT" })
  }
}
