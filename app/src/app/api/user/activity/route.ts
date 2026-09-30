import { requireAuth } from "@/lib/api-helpers"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { searchParamsObject } from "@/services/_shared/cursor"
import { pageQuerySchema } from "@/services/activity/activity.schemas"
import { listUserActivity } from "@/services/activity/activity.service"

/** The signed-in user's own actions across projects: `?cursor=&limit=` → `{ items, nextCursor }`. */
export async function GET(request: Request) {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error

  try {
    const query = pageQuerySchema.parse(searchParamsObject(request.url))
    return jsonResponse(await listUserActivity(gate.session.user.id, query))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "My activity LIST" })
  }
}
