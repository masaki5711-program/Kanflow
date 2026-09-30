import { requireAuth } from "@/lib/api-helpers"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { markAllNotificationsRead } from "@/services/notifications/notifications.service"

/** Mark all of my unread notifications read → `{ updated }`. */
export async function POST() {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error

  try {
    return jsonResponse(await markAllNotificationsRead(gate.session.user.id))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "Notification READ ALL" })
  }
}
