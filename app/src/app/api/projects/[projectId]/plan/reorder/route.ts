import { requireProject } from "@/lib/authz"
import { actorFromSession, successResponse, toHttpResponse } from "@/services/_shared"
import { reorderPlanSchema } from "@/services/plan/plan.schemas"
import { reorderPlan } from "@/services/plan/plan.service"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "plan.write")
  if ("error" in gate) return gate.error

  try {
    const { updates } = reorderPlanSchema.parse(await request.json())
    await reorderPlan(projectId, updates, actorFromSession(gate.session))
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "並び替えに失敗しました", context: "PlanItem reorder" })
  }
}
