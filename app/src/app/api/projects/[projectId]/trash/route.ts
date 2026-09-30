import { requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { listProjectTrash } from "@/services/trash/trash.service"

type Params = { params: Promise<{ projectId: string }> }

/** The project's trashed PBIs + Icebox items, newest deletion first (PO / SM / admin). */
export async function GET(_request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "trash.manage")
  if ("error" in gate) return gate.error

  try {
    return jsonResponse(await listProjectTrash(projectId))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Trash LIST" })
  }
}
