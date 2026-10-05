import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { createMetricSchema } from "@/services/milestones/milestones.schemas"
import { createMetric } from "@/services/milestones/milestones.budget"

type Params = { params: Promise<{ projectId: string }> }

/** Add a 推移 metric (plan.write). */
export async function POST(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "plan.write")
  if ("error" in gate) return gate.error

  try {
    const input = createMetricSchema.parse(await request.json())
    return jsonResponse(await createMetric(projectId, input, actorFromSession(gate.session)), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "作成に失敗しました", context: "Milestone metric POST" })
  }
}
