import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { reviewDecisionSchema } from "@/services/plan-actuals/actuals.schemas"
import { decideReviewProposal } from "@/services/plan-actuals/actuals-review.service"

type Params = { params: Promise<{ projectId: string; proposalId: string }> }

/** Body { decision: accept | reject, version } → the proposal. 409 PLAN_ACTUALS_CHANGED on a stale version / snapshot. */
export async function PATCH(request: Request, { params }: Params) {
  const { projectId, proposalId } = await params
  const gate = await requireProject(projectId, "plan.actualsReview")
  if ("error" in gate) return gate.error

  try {
    const input = reviewDecisionSchema.parse(await request.json())
    return jsonResponse(await decideReviewProposal(projectId, proposalId, input, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "AI の提案の決定に失敗しました", context: "Plan actuals review PATCH" })
  }
}
