import { requireAuth } from "@/lib/api-helpers"
import { actorFromSession, jsonResponse, successResponse, toHttpResponse } from "@/services/_shared"
import { readTemplateBody, templateWriteLimited } from "@/services/plan-templates/plan-templates.http"
import { updateTemplateSchema } from "@/services/plan-templates/plan-templates.schemas"
import { deleteTemplate, getTemplate, updateTemplate } from "@/services/plan-templates/plan-templates.service"

type Params = { params: Promise<{ id: string }> }

/** One template with its content (404 when private to someone else). */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params
  const gate = await requireAuth()
  if ("error" in gate) return gate.error

  try {
    return jsonResponse(await getTemplate(id, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "PlanTemplate GET" })
  }
}

/** Full replace { name, description?, visibility?, content, version } (409 VERSION_CONFLICT when stale). */
export async function PUT(request: Request, { params }: Params) {
  const { id } = await params
  const gate = await requireAuth()
  if ("error" in gate) return gate.error
  const limited = templateWriteLimited(gate.session.user.id)
  if (limited) return limited

  try {
    const input = updateTemplateSchema.parse(await readTemplateBody(request))
    return jsonResponse(await updateTemplate(id, input, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "PlanTemplate UPDATE" })
  }
}

/** Delete a user template (creator or admin; built-ins: 400 PLAN_TEMPLATE_BUILTIN). */
export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params
  const gate = await requireAuth()
  if ("error" in gate) return gate.error

  try {
    await deleteTemplate(id, actorFromSession(gate.session))
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "削除に失敗しました", context: "PlanTemplate DELETE" })
  }
}
