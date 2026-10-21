import { requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { getNewMrCount } from "@/services/git/git.service"

type Params = { params: Promise<{ projectId: string }> }

/** `?since=<ISO time>` gives the sidebar pill `{ enabled, count }`: open MRs that came in after it (no `since` = all open ones). */
export async function GET(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error
  const raw = new URL(request.url).searchParams.get("since")
  const parsed = raw ? new Date(raw) : null
  const since = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null
  try {
    return jsonResponse(await getNewMrCount(projectId, since))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Git new MRs GET" })
  }
}
