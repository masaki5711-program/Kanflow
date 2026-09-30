import { requireProject } from "@/lib/authz"
import { NotFoundError, actorFromSession, successResponse, toHttpResponse } from "@/services/_shared"
import { parseTrashEntityType } from "@/services/trash/trash.schemas"
import { restoreTrashItem } from "@/services/trash/trash.service"

type Params = { params: Promise<{ projectId: string; entityType: string; id: string }> }

/** Take a trashed PBI / Icebox item out of the trash (PO / SM / admin). */
export async function POST(_request: Request, { params }: Params) {
  const { projectId, entityType, id } = await params
  const gate = await requireProject(projectId, "trash.manage")
  if ("error" in gate) return gate.error

  try {
    const type = parseTrashEntityType(entityType)
    if (!type) throw new NotFoundError()
    await restoreTrashItem(projectId, type, id, actorFromSession(gate.session))
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "復元に失敗しました", context: "Trash RESTORE" })
  }
}
