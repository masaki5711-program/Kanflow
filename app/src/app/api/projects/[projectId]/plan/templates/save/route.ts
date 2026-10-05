import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { savePlanAsTemplate } from "@/services/plan-templates/plan-templates.apply"
import { readTemplateBody, templateWriteLimited } from "@/services/plan-templates/plan-templates.http"
import { savePlanAsTemplateSchema } from "@/services/plan-templates/plan-templates.schemas"

type Params = { params: Promise<{ projectId: string }> }

/** 「この計画をテンプレートとして保存」. Body { name, description?, visibility? } → the new template. */
export async function POST(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "plan.write")
  if ("error" in gate) return gate.error
  const limited = templateWriteLimited(gate.session.user.id)
  if (limited) return limited

  try {
    const input = savePlanAsTemplateSchema.parse(await readTemplateBody(request, 20_000))
    return jsonResponse(await savePlanAsTemplate(projectId, input, actorFromSession(gate.session)), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "テンプレートの保存に失敗しました", context: "PlanTemplate SAVE" })
  }
}
