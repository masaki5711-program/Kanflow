import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { learningSwitchSchema } from "@/services/plan-actuals/actuals.schemas"
import { setIncludeInLearning, snapshotItems } from "@/services/plan-actuals/actuals.service"

type Params = { params: Promise<{ projectId: string; snapshotId: string }> }

/** The snapshot's leaves (roles, days, slips — never owners or concurrency). → { items } */
export async function GET(_request: Request, { params }: Params) {
  const { projectId, snapshotId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    return jsonResponse({ items: await snapshotItems(projectId, snapshotId) })
  } catch (error) {
    return toHttpResponse(error, { fallback: "実績の取得に失敗しました", context: "Plan actuals items GET" })
  }
}

/** Body { includeInLearning, reason, version } → the snapshot. 409 PLAN_ACTUALS_CHANGED on a stale version. */
export async function PATCH(request: Request, { params }: Params) {
  const { projectId, snapshotId } = await params
  const gate = await requireProject(projectId, "plan.actualsFinalize")
  if ("error" in gate) return gate.error

  try {
    const input = learningSwitchSchema.parse(await request.json())
    return jsonResponse(await setIncludeInLearning(projectId, snapshotId, input, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "学習に使うかの切り替えに失敗しました", context: "Plan actuals LEARNING" })
  }
}
