import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { reflowSchema } from "@/services/plan/plan.assist.schemas"
import { reflowPlan } from "@/services/plan/plan.reflow"
import { readTemplateBody, templateWriteLimited } from "@/services/plan-templates/plan-templates.http"

type Params = { params: Promise<{ projectId: string }> }

/** 依存関係で再計算. Body { apply, businessDays? }. apply=false only previews. → { applied, moved[], skipped[] } */
export async function POST(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "plan.write")
  if ("error" in gate) return gate.error

  const limited = templateWriteLimited(gate.session.user.id)
  if (limited) return limited

  try {
    const input = reflowSchema.parse(await readTemplateBody(request, 2_000))
    return jsonResponse(await reflowPlan(projectId, input, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "日程の再計算に失敗しました", context: "Plan REFLOW" })
  }
}
