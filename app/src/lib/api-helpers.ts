import path from "path"
import fs from "fs/promises"
import crypto from "crypto"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

/**
 * Verify that a resolved file path stays within the uploads directory.
 * Prevents path traversal attacks.
 */
export function safeFilePath(projectId: string, fileName: string): string | null {
  const uploadDir = path.join(process.cwd(), "private", "uploads")
  const resolved = path.resolve(uploadDir, projectId, fileName)
  if (!resolved.startsWith(uploadDir + path.sep)) {
    return null
  }
  return resolved
}

/**
 * Validate that a file extension contains only safe characters.
 */
export function safeExtension(rawExt: string): string {
  return /^\.[a-zA-Z0-9]+$/.test(rawExt) ? rawExt : ""
}

export const MAX_UPLOAD_SIZE = 50 * 1024 * 1024

const ALLOWED_MIME_PREFIXES = [
  "image/",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/zip",
  "application/x-zip-compressed",
  "text/",
  "application/json",
  "application/xml",
  "application/octet-stream",
]

export function isAllowedMime(mime: string): boolean {
  if (!mime) return false
  return ALLOWED_MIME_PREFIXES.some((p) => mime === p || mime.startsWith(p))
}

/**
 * Save an uploaded file to private/uploads/<projectId>/ with a random filename.
 * Returns stored metadata (fileName, originalName, fileSize, mimeType).
 */
export async function saveUploadedFile(
  projectId: string,
  file: File
): Promise<
  | { ok: true; fileName: string; originalName: string; fileSize: number; mimeType: string }
  | { ok: false; error: string; status: number }
> {
  if (!file) return { ok: false, error: "ファイルがありません", status: 400 }
  if (file.size <= 0) return { ok: false, error: "ファイルが空です", status: 400 }
  if (file.size > MAX_UPLOAD_SIZE) {
    return { ok: false, error: "ファイルサイズが上限を超えています", status: 413 }
  }
  const mime = file.type || "application/octet-stream"
  if (!isAllowedMime(mime)) {
    return { ok: false, error: "許可されていないファイル形式です", status: 415 }
  }

  const originalName = file.name || "upload"
  const rawExt = path.extname(originalName)
  const ext = safeExtension(rawExt)
  const token = crypto.randomBytes(16).toString("hex")
  const fileName = `${Date.now()}_${token}${ext}`

  const projectDir = path.join(process.cwd(), "private", "uploads", projectId)
  await fs.mkdir(projectDir, { recursive: true })

  const full = safeFilePath(projectId, fileName)
  if (!full) return { ok: false, error: "パスが不正です", status: 400 }

  const buf = Buffer.from(await file.arrayBuffer())
  await fs.writeFile(full, buf)

  return {
    ok: true,
    fileName,
    originalName,
    fileSize: file.size,
    mimeType: mime,
  }
}

export async function deleteUploadedFile(projectId: string, fileName: string): Promise<void> {
  const full = safeFilePath(projectId, fileName)
  if (!full) return
  try {
    await fs.unlink(full)
  } catch {
    // Ignore missing file
  }
}

/**
 * Authenticate session and verify project membership.
 * Returns { session, member } on success or a NextResponse error.
 */
export async function requireProjectMember(
  projectId: string,
  options?: { roles?: string[] }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const where: Record<string, unknown> = {
    projectId,
    userId: session.user.id,
  }
  if (options?.roles) {
    where.role = { in: options.roles }
  }

  const member = await prisma.projectMember.findFirst({ where })
  if (!member) {
    return {
      error: NextResponse.json(
        { error: options?.roles ? "権限がありません" : "メンバーではありません" },
        { status: 403 }
      ),
    }
  }

  return { session, member }
}

/**
 * Authenticate session only (no membership check).
 */
export async function requireAuth() {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }
  return { session }
}

/**
 * Authenticate session and verify admin role.
 */
export async function requireAdmin() {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }
  if (session.user.role !== "admin") {
    return { error: NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 }) }
  }
  return { session }
}
