import { requireAuth } from "@/lib/api-helpers"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { readTemplateBody, templateWriteLimited } from "@/services/plan-templates/plan-templates.http"
import { duplicateTemplateSchema } from "@/services/plan-templates/plan-templates.schemas"
import { duplicateTemplate } from "@/services/plan-templates/plan-templates.service"

type Params = { params: Promise<{ id: string }> }

/** Copy a visible template. Body { name?, visibility? } → the new template (owned by the caller). */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params
  const gate = await requireAuth()
  if ("error" in gate) return gate.error
  const limited = templateWriteLimited(gate.session.user.id)
  if (limited) return limited

  try {
    const input = duplicateTemplateSchema.parse(await readTemplateBody(request))
    return jsonResponse(await duplicateTemplate(id, input, actorFromSession(gate.session)), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "複製に失敗しました", context: "PlanTemplate DUPLICATE" })
  }
}
