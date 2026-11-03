import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { versionSchema } from "@/services/plan-lesson-rules/lesson-rules.schemas"
import { retireSharedRule } from "@/services/plan-lesson-rules/lesson-rules.service"

import { requireLineageRuleConfirmer } from "@/lib/authz/require-lineage-rule"

type Params = { params: Promise<{ ruleId: string }> }

/** Retire a shared rule (admins). Body { version } → the rule. */
export async function POST(request: Request, { params }: Params) {
  const { ruleId } = await params
  const gate = await requireLineageRuleConfirmer()
  if ("error" in gate) return gate.error

  try {
    const { version } = versionSchema.parse(await request.json())
    return jsonResponse(await retireSharedRule(ruleId, version, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "反省点の規則の廃止に失敗しました", context: "Admin lesson rule RETIRE" })
  }
}
