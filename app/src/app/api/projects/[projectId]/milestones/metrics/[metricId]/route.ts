import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, successResponse, toHttpResponse } from "@/services/_shared"
import { updateMetricSchema } from "@/services/milestones/milestones.schemas"
import { deleteMetric, updateMetric } from "@/services/milestones/milestones.budget"

type Params = { params: Promise<{ projectId: string; metricId: string }> }

/** 推移 metric definition: name, unit, direction, baseline / target (plan.write). */
export async function PATCH(request: Request, { params }: Params) {
  const { projectId, metricId } = await params
  const gate = await requireProject(projectId, "plan.write")
  if ("error" in gate) return gate.error

  try {
    const input = updateMetricSchema.parse(await request.json())
    return jsonResponse(await updateMetric(projectId, metricId, input, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "Milestone metric PATCH" })
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { projectId, metricId } = await params
  const gate = await requireProject(projectId, "plan.write")
  if ("error" in gate) return gate.error

  try {
    await deleteMetric(projectId, metricId, actorFromSession(gate.session))
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "削除に失敗しました", context: "Milestone metric DELETE" })
  }
}
