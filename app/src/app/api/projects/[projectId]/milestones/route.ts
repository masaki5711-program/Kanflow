import { can, requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { getBoard } from "@/services/milestones/milestones.service"

/**
 * マイルストーン・検収ボード (general projects): stages from 全体計画, checks,
 * punch list, documents, budget, trend and the summary strip, plus what the
 * viewer may change (UI hints only; every write route checks again). Pending
 * template loads are seeded onto the board first (idempotent).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    const board = await getBoard(projectId)
    const permissions = { canEdit: can(gate.actor, "plan.write"), canTrack: can(gate.actor, "milestone.track") }
    return jsonResponse({ ...board, permissions, viewerId: gate.actor.userId })
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Milestone board GET" })
  }
}
