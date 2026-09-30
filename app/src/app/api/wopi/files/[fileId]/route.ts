import { NextResponse } from "next/server"
import fs from "fs/promises"
import { prisma } from "@/lib/prisma"
import { safeFilePath } from "@/lib/api-helpers"
import { authorizeWopi } from "../../_lib/wopi-auth"

/** WOPI CheckFileInfo */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const { fileId } = await params
  const authz = await authorizeWopi(request, fileId)
  if ("error" in authz) return authz.error
  const { claims, access } = authz

  const attachment = await prisma.projectAttachment.findFirst({
    where: { id: claims.attachmentId, projectId: claims.projectId },
  })
  if (!attachment) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })

  const full = safeFilePath(claims.projectId, attachment.fileName)
  if (!full) return NextResponse.json({ error: "Invalid path", code: "INVALID_PATH" }, { status: 400 })

  let size = attachment.fileSize
  try {
    const stat = await fs.stat(full)
    size = stat.size
  } catch {
    return NextResponse.json({ error: "File missing", code: "FILE_MISSING" }, { status: 404 })
  }

  return NextResponse.json({
    BaseFileName: attachment.originalName,
    Size: size,
    Version: attachment.updatedAt.toISOString(),
    OwnerId: attachment.uploadedBy ?? "kanflow",
    UserId: access.userId,
    UserFriendlyName: access.name,
    UserCanWrite: access.canWrite,
    ReadOnly: !access.canWrite,
    UserCanNotWriteRelative: true,
    SupportsUpdate: access.canWrite,
    SupportsLocks: false,
    LastModifiedTime: attachment.updatedAt.toISOString(),
  })
}
