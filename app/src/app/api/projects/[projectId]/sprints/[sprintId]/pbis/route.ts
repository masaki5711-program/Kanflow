import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { addSprintPbisSchema, removeSprintPbiSchema } from "@/services/sprint-backlog/sprint-backlog.schemas"
import { addPbisToSprint, removePbiFromSprint } from "@/services/sprint-backlog/sprint-backlog.service"

type Params = { params: Promise<{ projectId: string; sprintId: string }> }

/**
 * Attach product-backlog items to an existing sprint by inserting one empty
 * placeholder SprintBacklogItem per pbId (taskName null). The client's task
 * add flow then creates real tasks under each PB.
 */
export async function POST(request: Request, { params }: Params) {
  const { projectId, sprintId } = await params
  const gate = await requireProject(projectId, "sprint.manage")
  if ("error" in gate) return gate.error

  try {
    const { pbIds } = addSprintPbisSchema.parse(await request.json())
    const result = await addPbisToSprint(projectId, sprintId, pbIds, actorFromSession(gate.session))
    return jsonResponse(result, result.added === 0 ? 200 : 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "追加に失敗しました", context: "Sprint PBI add" })
  }
}

/**
 * Detach a PBI from the sprint: removes the placeholder plus any real tasks.
 * Dangerous — requires PO/SM and will delete tasks as well.
 */
export async function DELETE(request: Request, { params }: Params) {
  const { projectId, sprintId } = await params
  const gate = await requireProject(projectId, "sprint.manage")
  if ("error" in gate) return gate.error

  try {
    const { pbItemId } = removeSprintPbiSchema.parse(await request.json())
    return jsonResponse(await removePbiFromSprint(projectId, sprintId, pbItemId, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "削除に失敗しました", context: "Sprint PBI remove" })
  }
}
