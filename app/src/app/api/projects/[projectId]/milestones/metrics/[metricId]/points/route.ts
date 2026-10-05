import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { putMetricPointSchema } from "@/services/milestones/milestones.schemas"
import { putMetricPoint } from "@/services/milestones/milestones.budget"

type Params = { params: Promise<{ projectId: string; metricId: string }> }

/** One month's value (`value: null` removes it): any member (milestone.track). */
export async function PUT(request: Request, { params }: Params) {
  const { projectId, metricId } = await params
  const gate = await requireProject(projectId, "milestone.track")
  if ("error" in gate) return gate.error

  try {
    const input = putMetricPointSchema.parse(await request.json())
    return jsonResponse(await putMetricPoint(projectId, metricId, input, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "Milestone metric point PUT" })
  }
}
