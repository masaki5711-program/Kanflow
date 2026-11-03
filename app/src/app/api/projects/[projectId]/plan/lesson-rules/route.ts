import { can, requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { createRuleSchema } from "@/services/plan-lesson-rules/lesson-rules.schemas"
import { createDraft, lessonRulePageContext, listProjectRules } from "@/services/plan-lesson-rules/lesson-rules.service"

type Params = { params: Promise<{ projectId: string }> }

/**
 * 反省点の規則 of this project (every state; quotes are project-internal, so project.view).
 * → { rules, permissions: { draft, confirm, requestPromotion }, projectType, lineages, sprints }
 */
export async function GET(_request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    const [rules, context] = await Promise.all([listProjectRules(projectId), lessonRulePageContext(projectId)])
    const permissions = {
      draft: can(gate.actor, "plan.write"),
      confirm: can(gate.actor, "plan.lessonRule.confirm"),
      requestPromotion: can(gate.actor, "plan.lessonRule.requestPromotion"),
    }
    return jsonResponse({ rules, permissions, ...context })
  } catch (error) {
    return toHttpResponse(error, { fallback: "反省点の規則の取得に失敗しました", context: "Plan lesson rules LIST" })
  }
}

/** Body { kind, params, quote?, sourceLessonId?, sourceBacklogItemIds?, sourceSprintId? } → the new draft (201). */
export async function POST(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "plan.write")
  if ("error" in gate) return gate.error

  try {
    const input = createRuleSchema.parse(await request.json())
    return jsonResponse(await createDraft(projectId, input, actorFromSession(gate.session)), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "反省点の規則の作成に失敗しました", context: "Plan lesson rule CREATE" })
  }
}
