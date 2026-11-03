import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { promotionDecisionSchema } from "@/services/plan-lesson-rules/lesson-rules.schemas"
import { decidePromotion } from "@/services/plan-lesson-rules/lesson-rules.service"
import { requireLineageRuleConfirmer } from "@/lib/authz/require-lineage-rule"

type Params = { params: Promise<{ ruleId: string }> }

/**
 * Decide a promotion request. Body { decision: "confirm", version, kind, params } (the kind and numbers shown; the
 * quote is removed) or { decision: "reject", version } → the rule.
 */
export async function POST(request: Request, { params }: Params) {
  const { ruleId } = await params
  const gate = await requireLineageRuleConfirmer()
  if ("error" in gate) return gate.error

  try {
    const input = promotionDecisionSchema.parse(await request.json())
    return jsonResponse(await decidePromotion(ruleId, input, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "反省点の規則の昇格に失敗しました", context: "Admin lesson rule PROMOTION" })
  }
}
