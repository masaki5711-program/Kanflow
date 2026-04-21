import { NextResponse } from "next/server"
import fs from "fs/promises"
import { prisma } from "@/lib/prisma"
import { requireProjectMember, safeFilePath, deleteUploadedFile } from "@/lib/api-helpers"
import { z } from "zod"

const patchSchema = z.object({
  folderId: z.string().nullable().optional(),
})

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string; attachmentId: string }> }
) {
  const { projectId, attachmentId } = await params
  const result = await requireProjectMember(projectId)
  if ("error" in result) return result.error

  const attachment = await prisma.projectAttachment.findFirst({
    where: { id: attachmentId, projectId },
  })
  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const full = safeFilePath(projectId, attachment.fileName)
  if (!full) return NextResponse.json({ error: "パスが不正です" }, { status: 400 })

  try {
    const buf = await fs.readFile(full)
    const arrayBuffer = buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength,
    ) as ArrayBuffer
    const { searchParams } = new URL(request.url)
    const disposition = searchParams.get("download") !== null ? "attachment" : "inline"
    const encoded = encodeURIComponent(attachment.originalName)
    return new NextResponse(arrayBuffer, {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Disposition": `${disposition}; filename="${encoded}"; filename*=UTF-8''${encoded}`,
        "Content-Length": String(buf.length),
      },
    })
  } catch {
    return NextResponse.json({ error: "File missing" }, { status: 404 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string; attachmentId: string }> }
) {
  const { projectId, attachmentId } = await params
  const result = await requireProjectMember(projectId)
  if ("error" in result) return result.error

  try {
    const body = await request.json()
    const data = patchSchema.parse(body)

    if (data.folderId) {
      const folder = await prisma.attachmentFolder.findFirst({
        where: { id: data.folderId, projectId },
        select: { id: true },
      })
      if (!folder) return NextResponse.json({ error: "フォルダがありません" }, { status: 404 })
    }

    const attachment = await prisma.projectAttachment.update({
      where: { id: attachmentId, projectId },
      data: { folderId: data.folderId ?? null },
    })

    return NextResponse.json(attachment)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("Attachment PATCH error:", error)
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 })
  }
}

export async function DELETE(
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

  await prisma.projectAttachment.delete({ where: { id: attachmentId } })
  await deleteUploadedFile(projectId, attachment.fileName)

  return NextResponse.json({ success: true })
}
