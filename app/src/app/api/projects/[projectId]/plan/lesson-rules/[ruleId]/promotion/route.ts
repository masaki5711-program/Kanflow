import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { promotionRequestSchema } from "@/services/plan-lesson-rules/lesson-rules.schemas"
import { requestPromotion } from "@/services/plan-lesson-rules/lesson-rules.service"

type Params = { params: Promise<{ projectId: string; ruleId: string }> }

/**
 * The PO asks an admin to widen a confirmed rule to a lineage and / or project type. Body { version, lineage?,
 * projectType? } → the rule. 400 PLAN_RULE_PROMOTION_BLOCKED for a retrospective rule or a confidential source.
 */
export async function POST(request: Request, { params }: Params) {
  const { projectId, ruleId } = await params
  const gate = await requireProject(projectId, "plan.lessonRule.requestPromotion")
  if ("error" in gate) return gate.error

  try {
    const input = promotionRequestSchema.parse(await request.json())
    return jsonResponse(await requestPromotion(projectId, ruleId, input, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "反省点の規則の昇格の申請に失敗しました", context: "Plan lesson rule PROMOTION REQUEST" })
  }
}
