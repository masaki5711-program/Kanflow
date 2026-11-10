import { requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { getAwaitingMrApprovals } from "@/services/git/mr-approvals.service"

type Params = { params: Promise<{ projectId: string }> }

/**
 * 承認を待っている MR (dashboard): the project's open GitStation merge requests the signed-in user could approve now
 * (GitStation allows it for them and they have not approved yet), with the PBI of each. At most 20 are read; the
 * answer is reused for 60 s per user. `{ supported: false, reason }` when the project does not read GitStation or
 * the user has no employee number.
 */
export async function GET(_request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "git.approve")
  if ("error" in gate) return gate.error
  try {
    return jsonResponse(await getAwaitingMrApprovals(projectId, gate.actor.userId))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Git MR approvals awaiting GET" })
  }
}
