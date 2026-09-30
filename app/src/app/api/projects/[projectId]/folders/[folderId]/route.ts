import { requireProject } from "@/lib/authz"
import { jsonResponse, successResponse, toHttpResponse } from "@/services/_shared"
import { updateFolderSchema } from "@/services/attachments/attachments.schemas"
import { deleteFolder, updateFolder } from "@/services/attachments/attachments.service"

type Params = { params: Promise<{ projectId: string; folderId: string }> }

export async function PATCH(request: Request, { params }: Params) {
  const { projectId, folderId } = await params
  const gate = await requireProject(projectId, "attachment.write")
  if ("error" in gate) return gate.error

  try {
    const input = updateFolderSchema.parse(await request.json())
    return jsonResponse(await updateFolder(projectId, folderId, input))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "Folder PATCH" })
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { projectId, folderId } = await params
  const gate = await requireProject(projectId, "attachment.write")
  if ("error" in gate) return gate.error

  try {
    await deleteFolder(projectId, folderId)
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "削除に失敗しました", context: "Folder DELETE" })
  }
}
