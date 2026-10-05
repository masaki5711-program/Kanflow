import { requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { getSummary } from "@/services/improvements/improvements.service"

/** Management summary: total effect, count per stage, standardized count, rollout completion, average achievement. */
export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    return jsonResponse(await getSummary(projectId))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Improvement summary GET" })
  }
}
