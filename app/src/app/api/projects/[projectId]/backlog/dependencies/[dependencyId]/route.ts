import { requireProject } from "@/lib/authz"
import { actorFromSession, successResponse, toHttpResponse } from "@/services/_shared"
import { deletePbiDependency } from "@/services/backlog/backlog.dependencies"

type Params = { params: Promise<{ projectId: string; dependencyId: string }> }

export async function DELETE(_request: Request, { params }: Params) {
  const { projectId, dependencyId } = await params
  const gate = await requireProject(projectId, "backlog.write")
  if ("error" in gate) return gate.error

  try {
    await deletePbiDependency(projectId, dependencyId, actorFromSession(gate.session))
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "依存関係の削除に失敗しました", context: "PBI dependency DELETE" })
  }
}
