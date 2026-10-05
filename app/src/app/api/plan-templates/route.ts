import { requireAuth } from "@/lib/api-helpers"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { readTemplateBody, templateWriteLimited } from "@/services/plan-templates/plan-templates.http"
import { createTemplateSchema } from "@/services/plan-templates/plan-templates.schemas"
import { createTemplate, listTemplates } from "@/services/plan-templates/plan-templates.service"

/** Plan templates the user can see (built-ins seeded on first call): `PlanTemplateSummaryDto[]`. Any logged-in user. */
export async function GET() {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error

  try {
    return jsonResponse(await listTemplates(actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "PlanTemplate LIST" })
  }
}

/** Body { name, description?, visibility?, content } → the new template (owned by the caller). */
export async function POST(request: Request) {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error
  const limited = templateWriteLimited(gate.session.user.id)
  if (limited) return limited

  try {
    const input = createTemplateSchema.parse(await readTemplateBody(request))
    return jsonResponse(await createTemplate(input, actorFromSession(gate.session)), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "作成に失敗しました", context: "PlanTemplate CREATE" })
  }
}
