import { requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { searchParamsObject } from "@/services/_shared/cursor"
import { projectActivityQuerySchema } from "@/services/activity/activity.schemas"
import { listProjectActivity } from "@/services/activity/activity.service"

type Params = { params: Promise<{ projectId: string }> }

/** Project activity feed: `?cursor=&limit=(1-100, default 50)&entityType=` → `{ items, nextCursor }`. */
export async function GET(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    const query = projectActivityQuerySchema.parse(searchParamsObject(request.url))
    return jsonResponse(await listProjectActivity(projectId, query))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Activity LIST" })
  }
}
