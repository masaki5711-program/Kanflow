import { requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { completeRepositoryBinding } from "@/services/git/repo-bindings.service"

type Params = { params: Promise<{ projectId: string; attemptId: string }> }

/**
 * X3 確認しました: claim the person's confirmation from GitStation and bind / unbind → `{ outcome, binding }`. Only
 * the user who started the attempt (another user's is 404). Before the person confirmed in GitStation: 409
 * GIT_APPROVAL_NOT_CONFIRMED (press again after confirming).
 */
export async function POST(_request: Request, { params }: Params) {
  const { projectId, attemptId } = await params
  const gate = await requireProject(projectId, "git.bindRepository")
  if ("error" in gate) return gate.error
  try {
    return jsonResponse(await completeRepositoryBinding(projectId, gate.actor.userId, attemptId))
  } catch (error) {
    return toHttpResponse(error, { fallback: "結びつけを変更できませんでした", context: "Git repository binding complete" })
  }
}
