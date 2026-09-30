import { requireAuth } from "@/lib/api-helpers"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { searchParamsObject } from "@/services/_shared/cursor"
import { listNotificationsQuerySchema } from "@/services/notifications/notifications.schemas"
import { listMyNotifications } from "@/services/notifications/notifications.service"

/** My notifications, newest first: `?cursor=&limit=&unreadOnly=true` → `{ items, nextCursor, unreadCount }`. */
export async function GET(request: Request) {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error

  try {
    const query = listNotificationsQuerySchema.parse(searchParamsObject(request.url))
    return jsonResponse(await listMyNotifications(gate.session.user.id, query))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Notification LIST" })
  }
}
