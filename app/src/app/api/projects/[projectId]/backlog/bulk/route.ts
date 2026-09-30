import { can, forbiddenResponse, requireProject, type ProjectAction } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { bulkBacklogSchema, type BulkBacklogAction } from "@/services/backlog/backlog.schemas"
import { bulkBacklog } from "@/services/backlog/backlog.bulk"

type Params = { params: Promise<{ projectId: string }> }

/** Permission each bulk action needs on top of the backlog.write gate. */
const ACTION_PERMISSION: Readonly<Record<BulkBacklogAction, ProjectAction>> = {
  status: "backlog.write",
  assignPo: "backlog.write",
  addToSprint: "sprint.manage",
  trash: "backlog.delete",
}

/**
 * POST { ids (≤ 200), action: "status" | "assignPo" | "addToSprint" | "trash", payload }
 * → { action, affectedIds, skippedIds }. One transaction per request; every
 * touched PBI gets its own history row. Trashed PBIs are restorable through
 * POST /trash/backlog_item/:id/restore (the UI's "undo").
 */
export async function POST(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "backlog.write")
  if ("error" in gate) return gate.error

  try {
    const input = bulkBacklogSchema.parse(await request.json())
    if (!can(gate.actor, ACTION_PERMISSION[input.action])) return forbiddenResponse()
    return jsonResponse(await bulkBacklog(projectId, input, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "一括操作に失敗しました", context: "Backlog BULK" })
  }
}
