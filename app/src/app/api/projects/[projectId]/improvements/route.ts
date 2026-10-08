import { can, requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { createImprovementSchema } from "@/services/improvements/improvements.schemas"
import { createImprovement, getBoard } from "@/services/improvements/improvements.service"

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

/** Write an improvement straight onto the board (no PBI needed). */
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "release.manage")
  if ("error" in gate) return gate.error

  try {
    const input = createImprovementSchema.parse(await request.json())
    return jsonResponse(await createImprovement(projectId, input, actorFromSession(gate.session)), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "作成に失敗しました", context: "Improvement CREATE" })
  }
}
