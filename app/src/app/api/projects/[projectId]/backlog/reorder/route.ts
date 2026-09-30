import { requireProject } from "@/lib/authz"
import { actorFromSession, successResponse, toHttpResponse } from "@/services/_shared"
import { reorderBacklogSchema } from "@/services/backlog/backlog.schemas"
import { reorderBacklog } from "@/services/backlog/backlog.service"

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "backlog.reorder")
  if ("error" in gate) return gate.error

  try {
    const { orderedIds } = reorderBacklogSchema.parse(await request.json())
    await reorderBacklog(projectId, orderedIds, actorFromSession(gate.session))
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "並び替えに失敗しました", context: "Backlog reorder" })
  }
}
