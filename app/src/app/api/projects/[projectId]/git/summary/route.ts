import { requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { getGitSummaries } from "@/services/git/git.service"

type Params = { params: Promise<{ projectId: string }> }

/** `?pbiIds=a,b,c` gives card badges `{ enabled, summaries: { [pbiId]: { openMrs, mergedMrs, branches, pipeline } } }`. */
export async function GET(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error
  const ids = (new URL(request.url).searchParams.get("pbiIds") ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  try {
    return jsonResponse(await getGitSummaries(projectId, ids))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Git summary GET" })
  }
}
