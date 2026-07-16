import { NextResponse } from "next/server"
import fs from "fs/promises"
import { prisma } from "@/lib/prisma"
import { requireProjectMember, safeFilePath, deleteUploadedFile } from "@/lib/api-helpers"
import { z } from "zod"

const patchSchema = z.object({
  folderId: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
})

/**
 * Serve an attachment. Supports HTTP Range requests so browsers can stream
 * video/audio (HTML5 <video>/<audio> require 206 Partial Content to seek).
 * Query `?download=1` forces attachment Content-Disposition.
 */
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

  let stat: import("fs").Stats
  try {
    stat = await (await import("fs/promises")).stat(full)
  } catch {
    return NextResponse.json({ error: "File missing" }, { status: 404 })
  }

  const { searchParams } = new URL(request.url)
  const forceDownload = searchParams.get("download") !== null
  const encoded = encodeURIComponent(attachment.originalName)
  const disposition = forceDownload ? "attachment" : "inline"
  const contentDisposition = `${disposition}; filename="${encoded}"; filename*=UTF-8''${encoded}`

  const totalSize = stat.size
  const rangeHeader = request.headers.get("range")

  // Range request — serve 206 partial content
  if (rangeHeader && /^bytes=\d*-\d*$/.test(rangeHeader)) {
    const [startStr, endStr] = rangeHeader.replace("bytes=", "").split("-")
    const start = startStr === "" ? Math.max(totalSize - parseInt(endStr || "0", 10), 0) : parseInt(startStr, 10)
    const end = endStr === "" || startStr === ""
      ? totalSize - 1
      : Math.min(parseInt(endStr, 10), totalSize - 1)

    if (isNaN(start) || isNaN(end) || start > end || start >= totalSize) {
      return new NextResponse(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${totalSize}` },
      })
    }

    const chunkSize = end - start + 1
    const fh = await fs.open(full, "r")
    try {
      const buf = Buffer.alloc(chunkSize)
      await fh.read(buf, 0, chunkSize, start)
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
      return new NextResponse(ab, {
        status: 206,
        headers: {
          "Content-Type": attachment.mimeType,
          "Content-Disposition": contentDisposition,
          "Content-Range": `bytes ${start}-${end}/${totalSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(chunkSize),
          "Cache-Control": "private, max-age=3600",
        },
      })
    } finally {
      await fh.close()
    }
  }

  // Full response
  try {
    const buf = await fs.readFile(full)
    const arrayBuffer = buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength,
    ) as ArrayBuffer
    return new NextResponse(arrayBuffer, {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Disposition": contentDisposition,
        "Content-Length": String(totalSize),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
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

    const updateData: Record<string, unknown> = {}
    if (data.folderId !== undefined) updateData.folderId = data.folderId
    if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder

    const attachment = await prisma.projectAttachment.update({
      where: { id: attachmentId, projectId },
      data: updateData,
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
