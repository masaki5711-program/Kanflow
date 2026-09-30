import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, successResponse, toHttpResponse } from "@/services/_shared"
import { parseVersionParam } from "@/services/_shared/versioning"
import { updateIceboxItemSchema } from "@/services/icebox/icebox.schemas"
import { deleteIceboxItem, updateIceboxItem } from "@/services/icebox/icebox.service"

type Params = { params: Promise<{ projectId: string; itemId: string }> }

export async function PATCH(request: Request, { params }: Params) {
  const { projectId, itemId } = await params
  const gate = await requireProject(projectId, "icebox.write")
  if ("error" in gate) return gate.error

  try {
    const input = updateIceboxItemSchema.parse(await request.json())
    return jsonResponse(await updateIceboxItem(projectId, itemId, input, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "Icebox PATCH" })
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const { projectId, itemId } = await params
  const gate = await requireProject(projectId, "icebox.write")
  if ("error" in gate) return gate.error

  try {
    // Moves the item to the project trash (restore / purge: /trash).
    // `?version=N` (optional) = optimistic lock; stale → 409 VERSION_CONFLICT.
    await deleteIceboxItem(projectId, itemId, actorFromSession(gate.session), parseVersionParam(request))
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "削除に失敗しました", context: "Icebox DELETE" })
  }
}
