import { can, requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { getBoard } from "@/services/improvements/improvements.service"

/**
 * 改善成果ボード: items with rollouts / checks / photos, the summary strip and
 * 横展開先 suggestions, plus what the viewer may change (UI hints only; every
 * write route checks again).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    const board = await getBoard(projectId)
    const permissions = { canManage: can(gate.actor, "release.manage"), canTrack: can(gate.actor, "improvement.track") }
    return jsonResponse({ ...board, permissions })
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Improvement board GET" })
  }
}
