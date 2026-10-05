import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { scheduleFromStart } from "@/services/plan-templates/plan-templates.apply"
import { readTemplateBody, templateWriteLimited } from "@/services/plan-templates/plan-templates.http"
import { scheduleFromSchema } from "@/services/plan-templates/plan-templates.schemas"

type Params = { params: Promise<{ projectId: string }> }

/** 「開始日を入れて日程を仮置き」. Body { rootIds?, startDate } → { updated, items: [{ id, plannedStart, plannedEnd }] }. */
export async function POST(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "plan.write")
  if ("error" in gate) return gate.error
  const limited = templateWriteLimited(gate.session.user.id)
  if (limited) return limited

  try {
    const input = scheduleFromSchema.parse(await readTemplateBody(request, 40_000))
    return jsonResponse(await scheduleFromStart(projectId, input, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "日程の仮置きに失敗しました", context: "Plan SCHEDULE FROM" })
  }
}
