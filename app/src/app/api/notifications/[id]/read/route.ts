import { requireAuth } from "@/lib/api-helpers"
import { successResponse, toHttpResponse } from "@/services/_shared"
import { notificationIdSchema } from "@/services/notifications/notifications.schemas"
import { markNotificationRead } from "@/services/notifications/notifications.service"

type Params = { params: Promise<{ id: string }> }

/** Mark one of MY notifications read (idempotent) → `{ success: true }`; others' ids → 404. */
export async function POST(_request: Request, { params }: Params) {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error

  try {
    const id = notificationIdSchema.parse((await params).id)
    await markNotificationRead(gate.session.user.id, id)
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "Notification READ" })
  }
}
