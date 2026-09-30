import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, successResponse, toHttpResponse } from "@/services/_shared"
import { updatePlanItemSchema } from "@/services/plan/plan.schemas"
import { deletePlanItem, updatePlanItem } from "@/services/plan/plan.service"

type Params = { params: Promise<{ projectId: string; itemId: string }> }

export async function PATCH(request: Request, { params }: Params) {
  const { projectId, itemId } = await params
  const gate = await requireProject(projectId, "plan.write")
  if ("error" in gate) return gate.error

  try {
    const input = updatePlanItemSchema.parse(await request.json())
    return jsonResponse(await updatePlanItem(projectId, itemId, input, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "PlanItem PATCH" })
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { projectId, itemId } = await params
  const gate = await requireProject(projectId, "plan.write")
  if ("error" in gate) return gate.error

  try {
    await deletePlanItem(projectId, itemId)
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "削除に失敗しました", context: "PlanItem DELETE" })
  }
}
