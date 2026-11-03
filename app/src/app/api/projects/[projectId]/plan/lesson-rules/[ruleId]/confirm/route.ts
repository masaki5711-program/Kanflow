import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { confirmRuleSchema } from "@/services/plan-lesson-rules/lesson-rules.schemas"
import { confirmRule } from "@/services/plan-lesson-rules/lesson-rules.service"

type Params = { params: Promise<{ projectId: string; ruleId: string }> }

/**
 * Confirm ONE draft. Body { version, kind, params } — the kind and numbers the confirmer was shown; anything else
 * than the stored rule is 409 PLAN_RULE_CHANGED. There is no bulk confirm (plan 12 §2.3).
 */
export async function POST(request: Request, { params }: Params) {
  const { projectId, ruleId } = await params
  const gate = await requireProject(projectId, "plan.lessonRule.confirm")
  if ("error" in gate) return gate.error

  try {
    const input = confirmRuleSchema.parse(await request.json())
    return jsonResponse(await confirmRule(projectId, ruleId, input, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "反省点の規則の確定に失敗しました", context: "Plan lesson rule CONFIRM" })
  }
}
