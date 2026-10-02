import { serveStoredFile } from "@/lib/api-helpers"
import { requireProject } from "@/lib/authz"
import { actorFromSession, successResponse, toHttpResponse } from "@/services/_shared"
import { deletePbiAttachment, getPbiAttachment } from "@/services/backlog/backlog.attachments"

type Params = { params: Promise<{ projectId: string; itemId: string; attachmentId: string }> }

/** Serves the file: inline for safe types (images, PDF...), `?download` forces a download. */
export async function GET(request: Request, { params }: Params) {
  const { projectId, itemId, attachmentId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    const attachment = await getPbiAttachment(projectId, itemId, attachmentId)
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
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "PBI attachment GET" })
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { projectId, itemId, attachmentId } = await params
  const gate = await requireProject(projectId, "backlog.write")
  if ("error" in gate) return gate.error

  try {
    await deletePbiAttachment(projectId, itemId, attachmentId, actorFromSession(gate.session))
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "削除に失敗しました", context: "PBI attachment DELETE" })
  }
}
