import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireProjectMember } from "@/lib/api-helpers"
import { getCollaboraEditorUrl, isEditableInCollabora } from "@/lib/collabora"

function downloadUrlFor(projectId: string, attachmentId: string): string {
  return `/api/projects/${projectId}/attachments/${attachmentId}`
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; attachmentId: string }> }
) {
  const { projectId, attachmentId } = await params
  const result = await requireProjectMember(projectId)
  if ("error" in result) return result.error

  const attachment = await prisma.projectAttachment.findFirst({
    where: { id: attachmentId, projectId },
  })
  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 })

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

  const accessToken = process.env.WOPI_ACCESS_TOKEN
  if (!accessToken) {
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

  try {
    const { editorUrl } = await getCollaboraEditorUrl(
      projectId,
      attachmentId,
      attachment.mimeType
    )
    return NextResponse.json({ editorUrl, accessToken })
  } catch (error) {
    console.error("Collabora editor config error:", error)
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
