import { requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { searchParamsObject } from "@/services/_shared/cursor"
import { commentCountsQuerySchema } from "@/services/comments/comments.schemas"
import { getCommentCounts } from "@/services/comments/comments.service"

type Params = { params: Promise<{ projectId: string }> }

/** Badge counts: `?entityType=&ids=a,b,c` (≤ 200 ids) → `{ counts: { [id]: n }, unread: { [id]: n } }` (live comments; the viewer's unread notifications). */
export async function GET(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    const query = commentCountsQuerySchema.parse(searchParamsObject(request.url))
    return jsonResponse(await getCommentCounts(projectId, query, gate.actor.userId))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Comment COUNTS" })
  }
}
