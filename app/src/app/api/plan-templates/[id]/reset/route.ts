import { requireAuth } from "@/lib/api-helpers"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { readTemplateBody, templateWriteLimited } from "@/services/plan-templates/plan-templates.http"
import { resetTemplateSchema } from "@/services/plan-templates/plan-templates.schemas"
import { resetTemplate } from "@/services/plan-templates/plan-templates.service"

type Params = { params: Promise<{ id: string }> }

/** 「デフォルトに戻す」 for a built-in template. Body { version? } → the template. */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params
  const gate = await requireAuth()
  if ("error" in gate) return gate.error
  const limited = templateWriteLimited(gate.session.user.id)
  if (limited) return limited

  try {
    const { version } = resetTemplateSchema.parse(await readTemplateBody(request))
    return jsonResponse(await resetTemplate(id, version, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "PlanTemplate RESET" })
  }
}
