import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { getPlanLinks, setPlanLinks } from "@/services/plan/plan.links"
import { setPlanLinksSchema } from "@/services/plan/plan.schemas"

type Params = { params: Promise<{ projectId: string; itemId: string }> }

/** → { pbis: [{ id, displayId, title, status, points, sprint }] } */
export async function GET(_request: Request, { params }: Params) {
  const { projectId, itemId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    return jsonResponse(await getPlanLinks(projectId, itemId))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "PlanItem links GET" })
  }
}

/** Body { pbiIds } replaces the linked set (leaf items only; PBIs linked elsewhere are moved). */
export async function PUT(request: Request, { params }: Params) {
  const { projectId, itemId } = await params
  const gate = await requireProject(projectId, "plan.write")
  if ("error" in gate) return gate.error

  try {
    const { pbiIds } = setPlanLinksSchema.parse(await request.json())
    return jsonResponse(await setPlanLinks(projectId, itemId, pbiIds, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "PlanItem links PUT" })
  }
}
