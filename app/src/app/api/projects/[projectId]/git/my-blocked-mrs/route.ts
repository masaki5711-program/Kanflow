import { requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { getMyBlockedMrs } from "@/services/git/my-blocked-mrs.service"

type Params = { params: Promise<{ projectId: string }> }

/**
 * N10 自分の MR で止まっているもの (dashboard): the signed-in user's open merge requests that cannot merge yet or are
 * predicted to conflict — from Kanflow's copy of GitStation's status (no GitStation call). Project members.
 */
export async function GET(_request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error
  try {
    return jsonResponse(await getMyBlockedMrs(projectId, gate.actor.userId))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Git my blocked MRs GET" })
  }
}
