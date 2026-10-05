import { requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { getPbiGitPanel } from "@/services/git/git.service"

type Params = { params: Promise<{ projectId: string }> }

/** `?pbiId=` gives the development panel of that PBI (`{ enabled: false }` when the integration is off). */
export async function GET(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error
  const pbiId = new URL(request.url).searchParams.get("pbiId")
  if (!pbiId) return jsonResponse({ error: "pbiId is required", code: "VALIDATION" }, 400)
  try {
    return jsonResponse(await getPbiGitPanel(projectId, pbiId))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Git links GET" })
  }
}
