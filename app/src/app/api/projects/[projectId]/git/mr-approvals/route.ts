import { requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { getMrApprovals } from "@/services/git/mr-approvals.service"

type Params = { params: Promise<{ projectId: string }> }

/**
 * `?pbiId=`: per open GitStation merge request of the PBI, what the signed-in user could do through GitStation's
 * act-as (承認する / 承認を取り消す, with the reason when not) and the approval count (plan 11 K4).
 * `{ supported: false, reason }` when the project does not read GitStation or the user has no employee number.
 */
export async function GET(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "git.approve")
  if ("error" in gate) return gate.error
  const pbiId = new URL(request.url).searchParams.get("pbiId")
  if (!pbiId) return jsonResponse({ error: "pbiId is required", code: "VALIDATION" }, 400)
  try {
    return jsonResponse(await getMrApprovals(projectId, pbiId, gate.actor.userId))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Git MR approvals GET" })
  }
}
