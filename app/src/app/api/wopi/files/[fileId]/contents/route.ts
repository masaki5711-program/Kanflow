import { NextResponse } from "next/server"
import fs from "fs/promises"
import { prisma } from "@/lib/prisma"
import { safeFilePath } from "@/lib/api-helpers"

function verifyAccessToken(request: Request): boolean {
  const expected = process.env.WOPI_ACCESS_TOKEN
  if (!expected) return false
  const { searchParams } = new URL(request.url)
  const token = searchParams.get("access_token")
  return token === expected
}

function parseFileId(fileId: string): { projectId: string; attachmentId: string } | null {
  const underscore = fileId.indexOf("_")
  if (underscore <= 0) return null
  return {
    projectId: fileId.slice(0, underscore),
    attachmentId: fileId.slice(underscore + 1),
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> }
) {
  if (!verifyAccessToken(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { fileId } = await params
  const parsed = parseFileId(fileId)
  if (!parsed) return NextResponse.json({ error: "Invalid fileId" }, { status: 400 })

  const attachment = await prisma.projectAttachment.findFirst({
    where: { id: parsed.attachmentId, projectId: parsed.projectId },
  })
  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const full = safeFilePath(parsed.projectId, attachment.fileName)
  if (!full) return NextResponse.json({ error: "Invalid path" }, { status: 400 })

  try {
    const buf = await fs.readFile(full)
    const arrayBuffer = buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength,
    ) as ArrayBuffer
    return new NextResponse(arrayBuffer, {
      headers: {
        "Content-Type": attachment.mimeType,
      },
    })
  } catch {
    return NextResponse.json({ error: "File missing" }, { status: 404 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> }
) {
  if (!verifyAccessToken(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { fileId } = await params
  const parsed = parseFileId(fileId)
  if (!parsed) return NextResponse.json({ error: "Invalid fileId" }, { status: 400 })

  const attachment = await prisma.projectAttachment.findFirst({
    where: { id: parsed.attachmentId, projectId: parsed.projectId },
  })
  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const full = safeFilePath(parsed.projectId, attachment.fileName)
  if (!full) return NextResponse.json({ error: "Invalid path" }, { status: 400 })

  try {
    const buf = Buffer.from(await request.arrayBuffer())
    await fs.writeFile(full, buf)

    await prisma.projectAttachment.update({
      where: { id: parsed.attachmentId },
      data: { fileSize: buf.length, updatedAt: new Date() },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("WOPI PutFile error:", error)
    return NextResponse.json({ error: "Failed to save" }, { status: 500 })
  }
}
