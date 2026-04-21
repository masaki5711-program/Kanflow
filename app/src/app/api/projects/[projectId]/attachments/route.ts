import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireProjectMember, saveUploadedFile } from "@/lib/api-helpers"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const result = await requireProjectMember(projectId)
  if ("error" in result) return result.error

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const folderIdRaw = formData.get("folderId")
    const folderId = typeof folderIdRaw === "string" && folderIdRaw ? folderIdRaw : null

    if (!file) return NextResponse.json({ error: "ファイルがありません" }, { status: 400 })

    if (folderId) {
      const folder = await prisma.attachmentFolder.findFirst({
        where: { id: folderId, projectId },
        select: { id: true },
      })
      if (!folder) return NextResponse.json({ error: "フォルダがありません" }, { status: 404 })
    }

    const saved = await saveUploadedFile(projectId, file)
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status })

    const attachment = await prisma.projectAttachment.create({
      data: {
        projectId,
        folderId,
        fileName: saved.fileName,
        originalName: saved.originalName,
        fileSize: saved.fileSize,
        mimeType: saved.mimeType,
        uploadedBy: result.session.user.name ?? null,
      },
    })

    return NextResponse.json({
      id: attachment.id,
      originalName: attachment.originalName,
      fileName: attachment.fileName,
      fileSize: attachment.fileSize,
      mimeType: attachment.mimeType,
      folderId: attachment.folderId,
      createdAt: attachment.createdAt.toISOString(),
    }, { status: 201 })
  } catch (error) {
    console.error("Project attachment upload error:", error)
    return NextResponse.json({ error: "アップロードに失敗しました" }, { status: 500 })
  }
}
