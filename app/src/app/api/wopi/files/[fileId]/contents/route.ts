import { NextResponse } from "next/server"
import fs from "fs/promises"
import { prisma } from "@/lib/prisma"
import { MAX_UPLOAD_SIZE, safeFilePath } from "@/lib/api-helpers"
import { authorizeWopi, forbidden, readBodyWithLimit } from "../../../_lib/wopi-auth"

async function findAttachmentPath(projectId: string, attachmentId: string) {
  const attachment = await prisma.projectAttachment.findFirst({
    where: { id: attachmentId, projectId },
  })
  if (!attachment) return { error: NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 }) }
  const full = safeFilePath(projectId, attachment.fileName)
  if (!full) return { error: NextResponse.json({ error: "Invalid path", code: "INVALID_PATH" }, { status: 400 }) }
  return { attachment, full }
}

/** WOPI GetFile */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const { fileId } = await params
  const authz = await authorizeWopi(request, fileId)
  if ("error" in authz) return authz.error

  const found = await findAttachmentPath(authz.claims.projectId, authz.claims.attachmentId)
  if ("error" in found) return found.error

  try {
    const buf = await fs.readFile(found.full)
    const arrayBuffer = buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength,
    ) as ArrayBuffer
    return new NextResponse(arrayBuffer, {
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch {
    return NextResponse.json({ error: "File missing", code: "FILE_MISSING" }, { status: 404 })
  }
}

/** WOPI PutFile */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const { fileId } = await params
  const authz = await authorizeWopi(request, fileId)
  if ("error" in authz) return authz.error
  if (!authz.access.canWrite) return forbidden()

  const { projectId, attachmentId } = authz.claims
  const found = await findAttachmentPath(projectId, attachmentId)
  if ("error" in found) return found.error

  try {
    const read = await readBodyWithLimit(request, MAX_UPLOAD_SIZE)
    if (!read.ok) {
      return NextResponse.json({ error: "File too large", code: "PAYLOAD_TOO_LARGE" }, { status: 413 })
    }
    await fs.writeFile(found.full, read.body)

    await prisma.projectAttachment.update({
      where: { id: attachmentId },
      data: { fileSize: read.body.length, updatedAt: new Date() },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("WOPI PutFile error:", error)
    return NextResponse.json({ error: "Failed to save", code: "INTERNAL" }, { status: 500 })
  }
}
