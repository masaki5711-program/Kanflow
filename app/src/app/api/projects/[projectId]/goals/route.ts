import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { createGoalSchema } from "@/services/goals/goals.schemas"
import { createGoal, listGoals } from "@/services/goals/goals.service"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    return jsonResponse(await listGoals(projectId))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Goal LIST" })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "goal.write")
  if ("error" in gate) return gate.error

  try {
    const input = createGoalSchema.parse(await request.json())
    return jsonResponse(await createGoal(projectId, input, actorFromSession(gate.session)), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "作成に失敗しました", context: "Goal CREATE" })
  }
}
