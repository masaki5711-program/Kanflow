import { NextResponse } from "next/server"
import { requireProject } from "@/lib/authz"
import { getCollaboraEditorUrl, isEditableInCollabora } from "@/lib/collabora"
import { logger } from "@/lib/logger"
import { getWopiSigningKey, signWopiToken } from "@/lib/wopi-token"
import { toHttpResponse } from "@/services/_shared"
import { getAttachment } from "@/services/attachments/attachments.service"

const log = logger.child({ module: "editor-config" })

function downloadUrlFor(projectId: string, attachmentId: string): string {
  return `/api/projects/${projectId}/attachments/${attachmentId}`
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; attachmentId: string }> }
) {
  const { projectId, attachmentId } = await params
  const result = await requireProject(projectId, "attachment.write")
  if ("error" in result) return result.error

  let attachment: Awaited<ReturnType<typeof getAttachment>>
  try {
    attachment = await getAttachment(projectId, attachmentId)
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Editor config" })
  }

  const downloadUrl = downloadUrlFor(projectId, attachmentId)

  if (!isEditableInCollabora(attachment.mimeType)) {
    return NextResponse.json(
      {
        error: "このファイル形式はCollaboraで編集できません",
        code: "not_editable",
        downloadUrl,
        originalName: attachment.originalName,
      },
      { status: 400 }
    )
  }

  const signingKey = getWopiSigningKey()
  if (!signingKey) {
    return NextResponse.json(
      {
        error: "WOPI_ACCESS_TOKEN が設定されていません",
        code: "wopi_token_missing",
        downloadUrl,
        originalName: attachment.originalName,
      },
      { status: 500 }
    )
  }

  // Attachment writes are open to every project member (and admins), matching
  // the upload / PATCH / DELETE handlers, so the editor session may write too.
  const { token: accessToken, expiresAt: accessTokenTtl } = signWopiToken(
    { projectId, attachmentId, userId: result.session.user.id, canWrite: true },
    signingKey
  )

  try {
    const { editorUrl } = await getCollaboraEditorUrl(
      projectId,
      attachmentId,
      attachment.mimeType
    )
    return NextResponse.json({ editorUrl, accessToken, accessTokenTtl })
  } catch (error) {
    log.error("collabora editor config failed", { error: error instanceof Error ? error.message : String(error) })
    const msg = error instanceof Error ? error.message : String(error)
    const isUnreachable =
      msg.includes("fetch failed") ||
      msg.includes("ECONNREFUSED") ||
      msg.includes("ENOTFOUND") ||
      msg.includes("discovery XML")
    return NextResponse.json(
      {
        error: isUnreachable
          ? "Collabora Online サーバーに接続できません。ファイルをダウンロードしてローカルのアプリケーションで編集してください。"
          : "Collaboraエディタの起動に失敗しました",
        code: isUnreachable ? "collabora_unreachable" : "collabora_error",
        downloadUrl,
        originalName: attachment.originalName,
      },
      { status: 502 }
    )
  }
}
