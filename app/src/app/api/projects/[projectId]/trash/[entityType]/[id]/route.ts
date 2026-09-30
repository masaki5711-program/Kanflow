import { requireProject } from "@/lib/authz"
import { NotFoundError, actorFromSession, successResponse, toHttpResponse } from "@/services/_shared"
import { parseTrashEntityType } from "@/services/trash/trash.schemas"
import { purgeTrashItem } from "@/services/trash/trash.service"

type Params = { params: Promise<{ projectId: string; entityType: string; id: string }> }

/** Permanently delete a trashed PBI / Icebox item now (PO / admin). */
export async function DELETE(_request: Request, { params }: Params) {
  const { projectId, entityType, id } = await params
  const gate = await requireProject(projectId, "trash.purge")
  if ("error" in gate) return gate.error

  try {
    const type = parseTrashEntityType(entityType)
    if (!type) throw new NotFoundError()
    await purgeTrashItem(projectId, type, id, actorFromSession(gate.session))
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "削除に失敗しました", context: "Trash PURGE" })
  }
}
