import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, successResponse, toHttpResponse } from "@/services/_shared"
import { updateGoalSchema } from "@/services/goals/goals.schemas"
import { deleteGoal, updateGoal } from "@/services/goals/goals.service"

type Params = { params: Promise<{ projectId: string; goalId: string }> }

export async function PATCH(request: Request, { params }: Params) {
  const { projectId, goalId } = await params
  const gate = await requireProject(projectId, "goal.write")
  if ("error" in gate) return gate.error

  try {
    const input = updateGoalSchema.parse(await request.json())
    return jsonResponse(await updateGoal(projectId, goalId, input, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "Goal PATCH" })
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { projectId, goalId } = await params
  const gate = await requireProject(projectId, "goal.write")
  if ("error" in gate) return gate.error

  try {
    await deleteGoal(projectId, goalId)
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "削除に失敗しました", context: "Goal DELETE" })
  }
}
