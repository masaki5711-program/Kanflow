import { requireAuth } from "@/lib/api-helpers"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { getUnreadCount } from "@/services/notifications/notifications.service"

/** Bell badge polling: `{ unreadCount }`. */
export async function GET() {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error

  try {
    return jsonResponse(await getUnreadCount(gate.session.user.id))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Notification UNREAD" })
  }
}
