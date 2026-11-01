import { can, requireProject } from "@/lib/authz"
import { errorResponse, jsonResponse, toHttpResponse } from "@/services/_shared"
import { listBoardClaims } from "@/services/dev-work/dev-work.service"

type Params = { params: Promise<{ projectId: string }> }

const REF_MAX = 64

/**
 * 担当中 (work claims) for the screens — the session twin of `GET /api/v1/.../dev/claims`.
 * `?sprintId=` = every claim of one sprint's board in one read; `?pbi=` = one PBI's panel.
 * Any project viewer (`project.view`); no session ids. `canModerate` (sprint.manage: PO / SM /
 * admin) tells the panel whether to offer the release action.
 */
export async function GET(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error
  const query = new URL(request.url).searchParams
  const sprintId = query.get("sprintId")?.trim() ?? ""
  const pbi = query.get("pbi")?.trim() ?? ""
  if (!sprintId === !pbi || sprintId.length > REF_MAX || pbi.length > REF_MAX) {
    return errorResponse(400, "Give exactly one of sprintId or pbi", "VALIDATION")
  }
  try {
    const list = await listBoardClaims(projectId, sprintId ? { sprintId } : { pbi })
    return jsonResponse({ ...list, canModerate: can(gate.actor, "sprint.manage") })
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "work claims GET" })
  }
}
