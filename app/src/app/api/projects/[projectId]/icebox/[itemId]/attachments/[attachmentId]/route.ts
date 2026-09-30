import { serveStoredFile } from "@/lib/api-helpers"
import { requireProject } from "@/lib/authz"
import { actorFromSession, successResponse, toHttpResponse } from "@/services/_shared"
import { deleteIceboxAttachment, getIceboxAttachment } from "@/services/icebox/icebox.service"

type Params = { params: Promise<{ projectId: string; itemId: string; attachmentId: string }> }

export async function GET(request: Request, { params }: Params) {
  const { projectId, itemId, attachmentId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    const attachment = await getIceboxAttachment(projectId, itemId, attachmentId)
    const forceDownload = new URL(request.url).searchParams.get("download") !== null
    return await serveStoredFile(
      projectId,
      attachment.fileName,
      attachment.mimeType,
      attachment.originalName,
      request,
      forceDownload
    )
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Icebox attachment GET" })
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { projectId, itemId, attachmentId } = await params
  const gate = await requireProject(projectId, "icebox.write")
  if ("error" in gate) return gate.error

  try {
    await deleteIceboxAttachment(projectId, itemId, attachmentId, actorFromSession(gate.session))
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "削除に失敗しました", context: "Icebox attachment DELETE" })
  }
}
