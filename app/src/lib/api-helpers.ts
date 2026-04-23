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

export const MAX_UPLOAD_SIZE = 200 * 1024 * 1024

const ALLOWED_MIME_PREFIXES = [
  "image/",
  "video/",
  "audio/",
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

/**
 * Copy a template file from private/templates/ into the project's uploads directory.
 * Used to seed default attachments when a project is created.
 * Returns the stored metadata, or null if the template file does not exist.
 */
export async function copyTemplateFile(
  projectId: string,
  templateFileName: string,
  displayName: string,
  mimeType: string
): Promise<
  | { ok: true; fileName: string; originalName: string; fileSize: number; mimeType: string }
  | { ok: false; error: string }
> {
  const templatePath = path.resolve(process.cwd(), "private", "templates", templateFileName)
  const templatesRoot = path.join(process.cwd(), "private", "templates")
  if (!templatePath.startsWith(templatesRoot + path.sep)) {
    return { ok: false, error: "テンプレートパスが不正です" }
  }

  let buf: Buffer
  try {
    buf = await fs.readFile(templatePath)
  } catch {
    return { ok: false, error: "テンプレートファイルが見つかりません" }
  }

  const rawExt = path.extname(displayName)
  const ext = safeExtension(rawExt)
  const token = crypto.randomBytes(16).toString("hex")
  const fileName = `${Date.now()}_${token}${ext}`

  const projectDir = path.join(process.cwd(), "private", "uploads", projectId)
  await fs.mkdir(projectDir, { recursive: true })

  const full = safeFilePath(projectId, fileName)
  if (!full) return { ok: false, error: "パスが不正です" }

  await fs.writeFile(full, buf)

  return {
    ok: true,
    fileName,
    originalName: displayName,
    fileSize: buf.length,
    mimeType,
  }
}

/**
 * Serve a stored file to the browser with HTTP Range support. Returns a
 * NextResponse usable directly from route handlers. Required for HTML5
 * <video>/<audio> to seek/stream.
 */
export async function serveStoredFile(
  projectId: string,
  fileName: string,
  mimeType: string,
  originalName: string,
  request: Request,
  forceDownload: boolean
): Promise<import("next/server").NextResponse> {
  const { NextResponse } = await import("next/server")
  const full = safeFilePath(projectId, fileName)
  if (!full) return NextResponse.json({ error: "パスが不正です" }, { status: 400 })

  let stat: import("fs").Stats
  try {
    stat = await (await import("fs/promises")).stat(full)
  } catch {
    return NextResponse.json({ error: "File missing" }, { status: 404 })
  }

  const encoded = encodeURIComponent(originalName)
  const disposition = forceDownload ? "attachment" : "inline"
  const contentDisposition = `${disposition}; filename="${encoded}"; filename*=UTF-8''${encoded}`
  const totalSize = stat.size
  const rangeHeader = request.headers.get("range")

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
          "Content-Type": mimeType,
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

  try {
    const buf = await fs.readFile(full)
    const arrayBuffer = buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength,
    ) as ArrayBuffer
    return new NextResponse(arrayBuffer, {
      headers: {
        "Content-Type": mimeType,
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
