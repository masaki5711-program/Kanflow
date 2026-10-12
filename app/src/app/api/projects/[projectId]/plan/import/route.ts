import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { importPlanSchema } from "@/services/plan/plan.assist.schemas"
import { importPlanRows } from "@/services/plan/plan.import"
import { readTemplateBody, templateWriteLimited } from "@/services/plan-templates/plan-templates.http"

type Params = { params: Promise<{ projectId: string }> }

/** 一括取り込み. Body { parentId?, apply, rows[] }. Any row error → nothing is written. → { applied, count, errors[], createdIds[] } */
export async function POST(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "plan.write")
  if ("error" in gate) return gate.error

  const limited = templateWriteLimited(gate.session.user.id)
  if (limited) return limited

  try {
    const input = importPlanSchema.parse(await readTemplateBody(request, 250_000))
    return jsonResponse(await importPlanRows(projectId, input, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取り込みに失敗しました", context: "Plan IMPORT" })
  }
}
