import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { duplicatePlanSchema } from "@/services/plan/plan.assist.schemas"
import { duplicatePlanItem } from "@/services/plan/plan.duplicate"
import { readTemplateBody, templateWriteLimited } from "@/services/plan-templates/plan-templates.http"

type Params = { params: Promise<{ projectId: string; itemId: string }> }

/** 複製. Body { suffix? }. Copies the item and its live subtree after its siblings. → { createdIds[], rootId } */
export async function POST(request: Request, { params }: Params) {
  const { projectId, itemId } = await params
  const gate = await requireProject(projectId, "plan.write")
  if ("error" in gate) return gate.error

  const limited = templateWriteLimited(gate.session.user.id)
  if (limited) return limited

  try {
    const input = duplicatePlanSchema.parse(await readTemplateBody(request, 2_000))
    return jsonResponse(await duplicatePlanItem(projectId, itemId, input, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "複製に失敗しました", context: "Plan DUPLICATE" })
  }
}
