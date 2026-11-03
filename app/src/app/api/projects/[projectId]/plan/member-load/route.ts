import { can, requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { memberLoadQuerySchema } from "@/services/plan-leveling/capacity.schemas"
import { memberLoad } from "@/services/plan-leveling/load.service"

type Params = { params: Promise<{ projectId: string }> }

/**
 * ?from=YYYY-MM-DD&to=YYYY-MM-DD (≤ 26 weeks) → { members, canViewOthers, canManageAllocations, viewerId }. Utilization and overlap days across all
 * projects, never other projects' item names. Without plan.viewMemberLoad only the viewer's own row is returned.
 */
export async function GET(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error
  try {
    const url = new URL(request.url)
    const window = memberLoadQuerySchema.parse({ from: url.searchParams.get("from"), to: url.searchParams.get("to") })
    const canViewOthers = can(gate.actor, "plan.viewMemberLoad")
    return jsonResponse({
      members: await memberLoad(projectId, { userId: gate.session.user.id, canViewOthers }, window),
      canViewOthers,
      canManageAllocations: can(gate.actor, "capacity.manage"),
      viewerId: gate.session.user.id,
    })
  } catch (error) {
    return toHttpResponse(error, { fallback: "負荷の取得に失敗しました", context: "Plan member load" })
  }
}
