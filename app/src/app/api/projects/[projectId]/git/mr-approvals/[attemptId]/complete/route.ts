import { requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { completeMrApproval } from "@/services/git/mr-approvals.service"

type Params = { params: Promise<{ projectId: string; attemptId: string }> }

/**
 * 確認しました: claim the person's confirmation from GitStation and send the approval → `{ outcome, counted }`.
 * Only the user who started the attempt (another user's is 404). Before the person confirmed in GitStation:
 * 409 GIT_APPROVAL_NOT_CONFIRMED (press again after confirming).
 */
export async function POST(_request: Request, { params }: Params) {
  const { projectId, attemptId } = await params
  const gate = await requireProject(projectId, "git.approve")
  if ("error" in gate) return gate.error
  try {
    return jsonResponse(await completeMrApproval(projectId, gate.actor.userId, attemptId))
  } catch (error) {
    return toHttpResponse(error, { fallback: "承認に失敗しました", context: "Git MR approval complete" })
  }
}
