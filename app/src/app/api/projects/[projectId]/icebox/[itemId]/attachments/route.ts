import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireProjectMember, saveUploadedFile } from "@/lib/api-helpers"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; itemId: string }> }
) {
  const { projectId, itemId } = await params
  const result = await requireProjectMember(projectId)
  if ("error" in result) return result.error

  const item = await prisma.iceboxItem.findFirst({
    where: { id: itemId, projectId },
    select: { id: true },
  })
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 })

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    if (!file) return NextResponse.json({ error: "ファイルがありません" }, { status: 400 })

    const saved = await saveUploadedFile(projectId, file)
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status })

    const attachment = await prisma.iceboxAttachment.create({
      data: {
        iceboxItemId: itemId,
        fileName: saved.fileName,
        originalName: saved.originalName,
        fileSize: saved.fileSize,
        mimeType: saved.mimeType,
      },
    })

    return NextResponse.json(attachment, { status: 201 })
  } catch (error) {
    console.error("Icebox attachment upload error:", error)
    return NextResponse.json({ error: "アップロードに失敗しました" }, { status: 500 })
  }
}
