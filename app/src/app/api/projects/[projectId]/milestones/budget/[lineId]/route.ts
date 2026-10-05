import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, successResponse, toHttpResponse } from "@/services/_shared"
import { updateBudgetLineSchema } from "@/services/milestones/milestones.schemas"
import { deleteBudgetLine, updateBudgetLine } from "@/services/milestones/milestones.budget"

type Params = { params: Promise<{ projectId: string; lineId: string }> }

/** 予算 line name / plan / actual / note (plan.write). */
export async function PATCH(request: Request, { params }: Params) {
  const { projectId, lineId } = await params
  const gate = await requireProject(projectId, "plan.write")
  if ("error" in gate) return gate.error

  try {
    const input = updateBudgetLineSchema.parse(await request.json())
    return jsonResponse(await updateBudgetLine(projectId, lineId, input, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "Milestone budget PATCH" })
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { projectId, lineId } = await params
  const gate = await requireProject(projectId, "plan.write")
  if ("error" in gate) return gate.error

  try {
    await deleteBudgetLine(projectId, lineId, actorFromSession(gate.session))
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "削除に失敗しました", context: "Milestone budget DELETE" })
  }
}
