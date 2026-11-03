import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { updateDraftSchema } from "@/services/plan-lesson-rules/lesson-rules.schemas"
import { updateDraft } from "@/services/plan-lesson-rules/lesson-rules.service"

type Params = { params: Promise<{ projectId: string; ruleId: string }> }

/** Edit a draft. Body { version, kind, params, quote? } → the draft. 409 PLAN_RULE_CHANGED / PLAN_RULE_STATE. */
export async function PATCH(request: Request, { params }: Params) {
  const { projectId, ruleId } = await params
  const gate = await requireProject(projectId, "plan.write")
  if ("error" in gate) return gate.error

  try {
    const input = updateDraftSchema.parse(await request.json())
    return jsonResponse(await updateDraft(projectId, ruleId, input, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "反省点の規則の更新に失敗しました", context: "Plan lesson rule UPDATE" })
  }
}
