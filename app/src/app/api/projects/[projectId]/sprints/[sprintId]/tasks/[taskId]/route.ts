import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, successResponse, toHttpResponse } from "@/services/_shared"
import { parseVersionParam } from "@/services/_shared/versioning"
import { updateTaskSchema } from "@/services/sprint-backlog/sprint-backlog.schemas"
import { deleteTask, updateTask } from "@/services/sprint-backlog/sprint-backlog.service"

type Params = { params: Promise<{ projectId: string; sprintId: string; taskId: string }> }

export async function PATCH(request: Request, { params }: Params) {
  const { projectId, sprintId, taskId } = await params
  const gate = await requireProject(projectId, "task.write")
  if ("error" in gate) return gate.error

  try {
    const input = updateTaskSchema.parse(await request.json())
    return jsonResponse(await updateTask(projectId, sprintId, taskId, input, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "Sprint task PATCH" })
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const { projectId, sprintId, taskId } = await params
  const gate = await requireProject(projectId, "task.write")
  if ("error" in gate) return gate.error

  try {
    // `?version=N` (optional) = optimistic lock; stale → 409 VERSION_CONFLICT.
    await deleteTask(projectId, sprintId, taskId, actorFromSession(gate.session), parseVersionParam(request))
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "削除に失敗しました", context: "Sprint task DELETE" })
  }
}
