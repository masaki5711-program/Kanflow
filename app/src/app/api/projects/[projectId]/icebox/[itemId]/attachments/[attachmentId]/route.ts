import { NextResponse } from "next/server"
import fs from "fs/promises"
import { prisma } from "@/lib/prisma"
import { requireProjectMember, safeFilePath, deleteUploadedFile } from "@/lib/api-helpers"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; itemId: string; attachmentId: string }> }
) {
  const { projectId, itemId, attachmentId } = await params
  const result = await requireProjectMember(projectId)
  if ("error" in result) return result.error

  const attachment = await prisma.iceboxAttachment.findFirst({
    where: { id: attachmentId, iceboxItemId: itemId, iceboxItem: { projectId } },
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
    return new NextResponse(arrayBuffer, {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(attachment.originalName)}"`,
      },
    })
  } catch {
    return NextResponse.json({ error: "File missing" }, { status: 404 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; itemId: string; attachmentId: string }> }
) {
  const { projectId, itemId, attachmentId } = await params
  const result = await requireProjectMember(projectId)
  if ("error" in result) return result.error

  const attachment = await prisma.iceboxAttachment.findFirst({
    where: { id: attachmentId, iceboxItemId: itemId, iceboxItem: { projectId } },
  })
  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.iceboxAttachment.delete({ where: { id: attachmentId } })
  await deleteUploadedFile(projectId, attachment.fileName)

  return NextResponse.json({ success: true })
}
