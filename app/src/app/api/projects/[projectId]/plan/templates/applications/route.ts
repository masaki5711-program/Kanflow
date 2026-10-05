import { requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { listApplications } from "@/services/plan-templates/plan-templates.apply"

type Params = { params: Promise<{ projectId: string }> }

/** Template loads into this project's plan, newest first (duplicate-load warning). */
export async function GET(_request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    return jsonResponse(await listApplications(projectId))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "PlanTemplate APPLICATIONS" })
  }
}
