import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { versionSchema } from "@/services/plan-lesson-rules/lesson-rules.schemas"
import { retireRule } from "@/services/plan-lesson-rules/lesson-rules.service"

type Params = { params: Promise<{ projectId: string; ruleId: string }> }

/** Retire a draft or confirmed rule of this project. Body { version } → the rule. */
export async function POST(request: Request, { params }: Params) {
  const { projectId, ruleId } = await params
  const gate = await requireProject(projectId, "plan.lessonRule.confirm")
  if ("error" in gate) return gate.error

  try {
    const { version } = versionSchema.parse(await request.json())
    return jsonResponse(await retireRule(projectId, ruleId, version, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "反省点の規則の廃止に失敗しました", context: "Plan lesson rule RETIRE" })
  }
}
