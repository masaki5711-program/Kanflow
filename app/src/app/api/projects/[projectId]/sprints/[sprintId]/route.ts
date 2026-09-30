import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, successResponse, toHttpResponse } from "@/services/_shared"
import { updateSprintSchema } from "@/services/sprints/sprints.schemas"
import { deleteSprint, getSprint, updateSprint } from "@/services/sprints/sprints.service"

type Params = { params: Promise<{ projectId: string; sprintId: string }> }

export async function GET(_request: Request, { params }: Params) {
  const { projectId, sprintId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    return jsonResponse(await getSprint(projectId, sprintId))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Sprint GET" })
  }
}

/** Completing a sprint ("done" → archived) also launches the AI completion review in the background. */
export async function PATCH(request: Request, { params }: Params) {
  const { projectId, sprintId } = await params
  const gate = await requireProject(projectId, "sprint.manage")
  if ("error" in gate) return gate.error

  try {
    const input = updateSprintSchema.parse(await request.json())
    return jsonResponse(await updateSprint(projectId, sprintId, input, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "Sprint PATCH" })
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { projectId, sprintId } = await params
  const gate = await requireProject(projectId, "sprint.manage")
  if ("error" in gate) return gate.error

  try {
    await deleteSprint(projectId, sprintId)
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "削除に失敗しました", context: "Sprint DELETE" })
  }
}
