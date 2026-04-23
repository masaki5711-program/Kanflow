import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireProjectMember, deleteUploadedFile, serveStoredFile } from "@/lib/api-helpers"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string; itemId: string; attachmentId: string }> }
) {
  const { projectId, itemId, attachmentId } = await params
  const result = await requireProjectMember(projectId)
  if ("error" in result) return result.error

  const attachment = await prisma.iceboxAttachment.findFirst({
    where: { id: attachmentId, iceboxItemId: itemId, iceboxItem: { projectId } },
  })
  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { searchParams } = new URL(request.url)
  const forceDownload = searchParams.get("download") !== null

  return serveStoredFile(
    projectId,
    attachment.fileName,
    attachment.mimeType,
    attachment.originalName,
    request,
    forceDownload,
  )
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
