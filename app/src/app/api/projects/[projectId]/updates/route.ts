import { requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { getProjectUpdateSummary, getProjectUpdates } from "@/services/updates/updates.service"

type Params = { params: Promise<{ projectId: string }> }

/** The viewer's new activity + unread notifications of the project; `?summary=1` → counts only. */
export async function GET(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    const userId = gate.session.user.id
    const summary = new URL(request.url).searchParams.get("summary") === "1"
    return jsonResponse(summary ? await getProjectUpdateSummary(userId, projectId) : await getProjectUpdates(userId, projectId))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新情報の取得に失敗しました", context: "Project updates GET" })
  }
}
