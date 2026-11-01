import { requireProject } from "@/lib/authz"
import { actorFromSession } from "@/services/_shared/actor"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { releaseClaim } from "@/services/dev-work/dev-work.service"

type Params = { params: Promise<{ projectId: string; claimId: string }> }

/**
 * A PO / SM / admin ends someone's 担当中 from the PBI panel (sprint.manage) — the
 * session twin of the v1 moderator release: logged on the task / PBI, holder notified.
 * Releasing a released claim answers it unchanged. Gives `{ claim: { id, releasedAt, releaseReason } }`.
 */
export async function POST(_request: Request, { params }: Params) {
  const { projectId, claimId } = await params
  const gate = await requireProject(projectId, "sprint.manage")
  if ("error" in gate) return gate.error
  try {
    const { claim } = await releaseClaim(projectId, claimId, actorFromSession(gate.session), { canModerate: true })
    return jsonResponse({ claim: { id: claim.id, releasedAt: claim.releasedAt, releaseReason: claim.releaseReason } })
  } catch (error) {
    return toHttpResponse(error, { fallback: "解除に失敗しました", context: "work claim release POST" })
  }
}
