import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, successResponse, toHttpResponse } from "@/services/_shared"
import { updateImprovementSchema } from "@/services/improvements/improvements.schemas"
import { deleteImprovement, getImprovement, updateImprovement } from "@/services/improvements/improvements.service"

type Params = { params: Promise<{ projectId: string; id: string }> }

export async function GET(_request: Request, { params }: Params) {
  const { projectId, id } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    return jsonResponse(await getImprovement(projectId, id))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Improvement GET" })
  }
}

/** Effect, standardisation, 展開日 and stage (PO: release.manage). */
export async function PATCH(request: Request, { params }: Params) {
  const { projectId, id } = await params
  const gate = await requireProject(projectId, "release.manage")
  if ("error" in gate) return gate.error

  try {
    const input = updateImprovementSchema.parse(await request.json())
    return jsonResponse(await updateImprovement(projectId, id, input, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "Improvement PATCH" })
  }
}

/** Deletes the release item with its rollouts, checks and photos (stored files included). */
export async function DELETE(_request: Request, { params }: Params) {
  const { projectId, id } = await params
  const gate = await requireProject(projectId, "release.manage")
  if ("error" in gate) return gate.error

  try {
    await deleteImprovement(projectId, id, actorFromSession(gate.session))
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "削除に失敗しました", context: "Improvement DELETE" })
  }
}
