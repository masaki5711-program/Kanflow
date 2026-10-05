import { requireAuth } from "@/lib/api-helpers"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { listRevisions } from "@/services/plan-templates/plan-templates.service"

type Params = { params: Promise<{ id: string }> }

/** Edit history (who / when), newest first. `?revisionId=` → that one snapshot with its content. */
export async function GET(request: Request, { params }: Params) {
  const { id } = await params
  const gate = await requireAuth()
  if ("error" in gate) return gate.error

  try {
    const revisionId = new URL(request.url).searchParams.get("revisionId")?.slice(0, 64) || undefined
    return jsonResponse(await listRevisions(id, actorFromSession(gate.session), revisionId))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "PlanTemplate REVISIONS" })
  }
}
