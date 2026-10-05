import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { applyTemplate } from "@/services/plan-templates/plan-templates.apply"
import { readTemplateBody, templateWriteLimited } from "@/services/plan-templates/plan-templates.http"
import { applyTemplateSchema } from "@/services/plan-templates/plan-templates.schemas"

type Params = { params: Promise<{ projectId: string }> }

/**
 * Load a template into the plan as undated stages.
 * Body { templateId, excludePaths?, parentId? } → { applicationId, createdRootIds, createdCount, alreadyApplied, hasDurations }.
 */
export async function POST(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "plan.write")
  if ("error" in gate) return gate.error
  const limited = templateWriteLimited(gate.session.user.id)
  if (limited) return limited

  try {
    const input = applyTemplateSchema.parse(await readTemplateBody(request, 20_000))
    return jsonResponse(await applyTemplate(projectId, input, actorFromSession(gate.session)), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "テンプレートの読み込みに失敗しました", context: "PlanTemplate APPLY" })
  }
}
