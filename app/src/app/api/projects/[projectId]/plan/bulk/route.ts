import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { bulkPlanSchema } from "@/services/plan/plan.assist.schemas"
import { bulkEditPlan } from "@/services/plan/plan.bulk"
import { readTemplateBody, templateWriteLimited } from "@/services/plan-templates/plan-templates.http"

type Params = { params: Promise<{ projectId: string }> }

/** 一括編集. Body { target: { ids } | { fromDate }, op: shift | owner | status, apply }. → { applied, updated, moved[], skipped[] } */
export async function POST(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "plan.write")
  if ("error" in gate) return gate.error

  const limited = templateWriteLimited(gate.session.user.id)
  if (limited) return limited

  try {
    const input = bulkPlanSchema.parse(await readTemplateBody(request, 20_000))
    return jsonResponse(await bulkEditPlan(projectId, input, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "一括編集に失敗しました", context: "Plan BULK" })
  }
}
