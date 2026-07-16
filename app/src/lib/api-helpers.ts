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
 * System admins bypass the membership requirement and receive a synthetic
 * { role: "po" } membership so downstream PO-gated logic continues to work.
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

  // System admins always pass — they get a synthetic PO-level membership so
  // existing PO-gated branches stay valid.
  if (session.user.role === "admin") {
    return {
      session,
      member: {
        id: `admin-${session.user.id}`,
        projectId,
        userId: session.user.id,
        role: "po",
        joinedAt: new Date(),
      },
    }
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

/**
 * Access scope: which write actions a request is performing.
 * - "read":     view-only (any access path allowed)
 * - "icebox":   write to Icebox (section_manager allowed)
 * - "po":       PBI / sprint / settings (po-level only; section_manager forbidden)
 * - "memberWrite": writes that any project member can do (sprint task status, etc.)
 */
export type ProjectAccessScope = "read" | "icebox" | "po" | "memberWrite"

interface AuthSession {
  user: { id: string; name?: string | null; email?: string | null; role?: string }
}

interface ProjectAccessResult {
  session: AuthSession
  /** Project membership row, if the user is an explicit member; null otherwise */
  member: { role: string } | null
  /** How the user got access: explicit project member, system admin, or section_manager */
  via: "member" | "admin" | "section_manager"
}

/**
 * Verify that the current user can access the given project under the requested scope.
 * Resolution order:
 *   1. system admin    → full access (read/write all)
 *   2. project member  → access per existing project role rules
 *   3. section_manager whose sections include the project's section → read + icebox
 *   4. otherwise → 401/403
 */
export async function requireProjectAccess(
  projectId: string,
  scope: ProjectAccessScope = "read"
): Promise<{ error: NextResponse } | ProjectAccessResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  // 1. System admin: full access regardless of project section / membership.
  if (session.user.role === "admin") {
    return { session, member: null, via: "admin" }
  }

  // 2. Explicit project membership.
  const member = await prisma.projectMember.findFirst({
    where: { projectId, userId: session.user.id },
    select: { role: true },
  })
  if (member) {
    if (scope === "po" && member.role !== "po") {
      return { error: NextResponse.json({ error: "PO 権限が必要です" }, { status: 403 }) }
    }
    return { session, member, via: "member" }
  }

  // 3. Section manager whose sections overlap the project's sections.
  if (session.user.role === "section_manager") {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { sections: { select: { sectionId: true } } },
    })
    const projectSectionIds = project?.sections.map((s) => s.sectionId) ?? []
    if (projectSectionIds.length > 0) {
      const overlap = await prisma.userSection.findFirst({
        where: { userId: session.user.id, sectionId: { in: projectSectionIds } },
        select: { sectionId: true },
      })
      if (overlap) {
        // Section managers may read everything and write Icebox only.
        if (scope === "po" || scope === "memberWrite") {
          return {
            error: NextResponse.json(
              { error: "セクション管理者は Icebox 以外の編集はできません" },
              { status: 403 }
            ),
          }
        }
        return { session, member: null, via: "section_manager" }
      }
    }
  }

  // 4. No access path matched.
  return {
    error: NextResponse.json(
      { error: "このプロジェクトへのアクセス権がありません" },
      { status: 403 }
    ),
  }
}
