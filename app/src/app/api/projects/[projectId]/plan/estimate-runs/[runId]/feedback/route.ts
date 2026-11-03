import { requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { feedbackSchema } from "@/services/plan-estimate-run/estimate-run.schemas"
import { recordFeedback } from "@/services/plan-estimate-run/estimate-run.service"

type Params = { params: Promise<{ projectId: string; runId: string }> }

/**
 * 利用者の反応 on one item of an estimate run (plan 12 §2.1): { key, kind: too_high | too_low | rule_not_applicable |
 * other, note? (≤ 500) }. One per item, person and kind (a repeat updates the note). Needs plan.estimate.
 */
export async function POST(request: Request, { params }: Params) {
  const { projectId, runId } = await params
  const gate = await requireProject(projectId, "plan.estimate")
  if ("error" in gate) return gate.error
  try {
    const body = feedbackSchema.parse(await request.json())
    return jsonResponse(await recordFeedback(projectId, runId, body, gate.actor.userId), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "反応を記録できませんでした", context: "Plan ESTIMATE feedback" })
  }
}
