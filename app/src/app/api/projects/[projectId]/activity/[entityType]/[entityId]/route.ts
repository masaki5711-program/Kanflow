import { requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { searchParamsObject } from "@/services/_shared/cursor"
import { entityRefSchema, pageQuerySchema } from "@/services/activity/activity.schemas"
import { listEntityActivity } from "@/services/activity/activity.service"

type Params = { params: Promise<{ projectId: string; entityType: string; entityId: string }> }

/** History of one entity of the project: `?cursor=&limit=` → `{ items, nextCursor }`. */
export async function GET(request: Request, { params }: Params) {
  const { projectId, entityType, entityId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    const ref = entityRefSchema.parse({ entityType, entityId })
    const query = pageQuerySchema.parse(searchParamsObject(request.url))
    return jsonResponse(await listEntityActivity(projectId, ref, query))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Activity HISTORY" })
  }
}
