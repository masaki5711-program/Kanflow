import { requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { getGitOverview } from "@/services/git/git.service"

type Params = { params: Promise<{ projectId: string }> }

/** The Git page of the sidebar: repository status and the latest linked activity. */
export async function GET(_request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error
  try {
    return jsonResponse(await getGitOverview(projectId))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Git overview GET" })
  }
}
