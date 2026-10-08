import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { readTemplateBody, templateWriteLimited } from "@/services/plan-templates/plan-templates.http"
import { shiftFollowingSchema } from "@/services/plan/plan.schemas"
import { shiftFollowing } from "@/services/plan/plan.shift"

type Params = { params: Promise<{ projectId: string; itemId: string }> }

/**
 * 実績からの日程補正. Body { scope: "dependents" | "later", apply, deltaDays? }.
 * apply=false only previews. → { deltaDays, slipDays, applied, moved[], skipped[] }
 */
export async function POST(request: Request, { params }: Params) {
  const { projectId, itemId } = await params
  const gate = await requireProject(projectId, "plan.write")
  if ("error" in gate) return gate.error

  const limited = templateWriteLimited(gate.session.user.id)
  if (limited) return limited

  try {
    const input = shiftFollowingSchema.parse(await readTemplateBody(request, 2_000))
    return jsonResponse(await shiftFollowing(projectId, itemId, input, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "日程の補正に失敗しました", context: "Plan SHIFT FOLLOWING" })
  }
}
