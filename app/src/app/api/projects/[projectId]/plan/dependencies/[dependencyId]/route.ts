import { requireProject } from "@/lib/authz"
import { actorFromSession, successResponse, toHttpResponse } from "@/services/_shared"
import { deleteDependency } from "@/services/plan/plan.schedule"

type Params = { params: Promise<{ projectId: string; dependencyId: string }> }

export async function DELETE(_request: Request, { params }: Params) {
  const { projectId, dependencyId } = await params
  const gate = await requireProject(projectId, "plan.write")
  if ("error" in gate) return gate.error

  try {
    await deleteDependency(projectId, dependencyId, actorFromSession(gate.session))
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "依存関係の削除に失敗しました", context: "Plan dependency DELETE" })
  }
}
