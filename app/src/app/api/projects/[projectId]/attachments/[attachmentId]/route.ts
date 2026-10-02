import { NextResponse } from "next/server"
import { serveStoredFile } from "@/lib/api-helpers"
import { isLinkEntry, normalizeLinkUrl } from "@/lib/attachment-links"
import { requireProject } from "@/lib/authz"
import { jsonResponse, successResponse, toHttpResponse } from "@/services/_shared"
import { moveAttachmentSchema } from "@/services/attachments/attachments.schemas"
import { deleteAttachment, getAttachment, moveAttachment } from "@/services/attachments/attachments.service"

type Params = { params: Promise<{ projectId: string; attachmentId: string }> }

/**
 * Serve an attachment. Supports HTTP Range requests so browsers can stream
 * video/audio (HTML5 <video>/<audio> require 206 Partial Content to seek).
 * Query `?download=1` forces attachment Content-Disposition.
 */
export async function GET(request: Request, { params }: Params) {
  const { projectId, attachmentId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    const attachment = await getAttachment(projectId, attachmentId)
    if (isLinkEntry(attachment)) {
      // A link entry opens its URL (re-validated: only http(s) is ever redirected to).
      const url = normalizeLinkUrl(attachment.linkUrl ?? "")
      return url ? NextResponse.redirect(url, 302) : NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })
    }
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
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Attachment GET" })
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const { projectId, attachmentId } = await params
  const gate = await requireProject(projectId, "attachment.write")
  if ("error" in gate) return gate.error

  try {
    const input = moveAttachmentSchema.parse(await request.json())
    return jsonResponse(await moveAttachment(projectId, attachmentId, input))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "Attachment PATCH" })
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { projectId, attachmentId } = await params
  const gate = await requireProject(projectId, "attachment.write")
  if ("error" in gate) return gate.error

  try {
    await deleteAttachment(projectId, attachmentId)
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "削除に失敗しました", context: "Attachment DELETE" })
  }
}
