import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, successResponse, toHttpResponse } from "@/services/_shared"
import { updateReleaseItemSchema } from "@/services/releases/releases.schemas"
import { deleteReleaseItem, updateReleaseItem } from "@/services/releases/releases.service"

type Params = { params: Promise<{ projectId: string; id: string }> }

export async function PATCH(request: Request, { params }: Params) {
  const { projectId, id } = await params
  const gate = await requireProject(projectId, "release.manage")
  if ("error" in gate) return gate.error

  try {
    const input = updateReleaseItemSchema.parse(await request.json())
    return jsonResponse(await updateReleaseItem(projectId, id, input, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "Release PATCH" })
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { projectId, id } = await params
  const gate = await requireProject(projectId, "release.manage")
  if ("error" in gate) return gate.error

  try {
    await deleteReleaseItem(projectId, id)
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "削除に失敗しました", context: "Release DELETE" })
  }
}
