import path from "path"
import fs from "fs/promises"
import crypto from "crypto"
import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import {
  authorizeProject,
  can,
  isSystemAdmin,
  type ProjectActor,
} from "@/lib/authz"
import type { ApiErrorCode } from "@/services/_shared/error-codes"
import { HEAD_BYTES, verifyFileType, type FileTypeVerdict } from "@/lib/upload/file-type"
import { readHead, writeStreamToFile } from "@/lib/upload/stream-write"

/**
 * Verify that a resolved file path stays within the uploads directory.
 * Prevents path traversal attacks.
 */
/** Absolute root of all project uploads: `<cwd>/private/uploads`. */
export function uploadsRoot(): string {
  return path.join(process.cwd(), "private", "uploads")
}

/** Project ids are cuid-like; anything else never names an upload dir. */
const SAFE_PROJECT_ID = /^[A-Za-z0-9_-]{1,64}$/

/**
 * Absolute path of a project's upload directory, or null when `projectId`
 * is not a plain id or would resolve anywhere other than a DIRECT child of
 * the uploads root (empty, ".", "..", separators, absolute paths, ...).
 */
export function projectUploadDir(projectId: string): string | null {
  if (!SAFE_PROJECT_ID.test(projectId)) return null
  const root = uploadsRoot()
  const resolved = path.resolve(root, projectId)
  if (!resolved.startsWith(root + path.sep)) return null
  if (path.dirname(resolved) !== root) return null
  return resolved
}

/**
 * Recursively remove `private/uploads/<projectId>` (missing dir is fine).
 * Returns false (and touches nothing) when the id does not map to a safe
 * directory inside the uploads root. fs errors propagate to the caller.
 */
export async function removeProjectUploadDir(projectId: string): Promise<boolean> {
  const dir = projectUploadDir(projectId)
  if (!dir) return false
  await fs.rm(dir, { recursive: true, force: true })
  return true
}

export function safeFilePath(projectId: string, fileName: string): string | null {
  const uploadDir = uploadsRoot()
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
  const normalized = normalizeMime(mime)
  return ALLOWED_MIME_PREFIXES.some((p) => normalized === p || normalized.startsWith(p))
}

/** Lower-case and strip parameters (`text/plain; charset=utf-8` -> `text/plain`). */
export function normalizeMime(mime: string): string {
  return (mime.split(";")[0] ?? "").trim().toLowerCase()
}

/**
 * Real XML documents (which a browser may render, incl. XHTML / XSLT / SVG):
 * `application/xml`, `text/xml` and any structured-syntax `+xml` suffix
 * (`image/svg+xml`, `application/xhtml+xml`, ...). Office Open XML packages
 * (`application/vnd.openxmlformats-officedocument.*`) merely contain
 * "openxml" in the name — they are ZIP containers, not XML documents.
 */
function isXmlDocumentMime(mime: string): boolean {
  return mime === "application/xml" || mime === "text/xml" || mime.endsWith("+xml")
}

/**
 * Types a browser could execute or render as an active document when served
 * from our origin (stored XSS). Always served as an opaque download.
 */
function isActiveContentMime(mime: string): boolean {
  return (
    mime === "" ||
    mime.includes("html") ||
    isXmlDocumentMime(mime) ||
    mime.includes("svg") ||
    mime.includes("javascript") ||
    mime.includes("ecmascript")
  )
}

/** Only these types may be rendered inline in the browser. */
export function isInlineSafeMime(mime: string): boolean {
  const m = normalizeMime(mime)
  if (isActiveContentMime(m)) return false
  if (m === "application/pdf" || m === "text/plain") return true
  return m.startsWith("image/") || m.startsWith("video/") || m.startsWith("audio/")
}

export interface ServeHeaders {
  contentType: string
  disposition: "inline" | "attachment"
}

/**
 * Decide Content-Type / Content-Disposition for a stored upload.
 * - inline only for the safe whitelist (and only when not forced to download)
 * - active content (html / xml / svg / js) is downgraded to octet-stream
 * - everything else keeps its type but is forced to download
 */
export function resolveServeHeaders(mime: string, forceDownload: boolean): ServeHeaders {
  const m = normalizeMime(mime)
  if (isActiveContentMime(m)) {
    return { contentType: "application/octet-stream", disposition: "attachment" }
  }
  const disposition = !forceDownload && isInlineSafeMime(m) ? "inline" : "attachment"
  return { contentType: mime, disposition }
}

/** Constant-time string comparison for secrets (length-independent timing). */
export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (typeof a !== "string" || typeof b !== "string" || b.length === 0) return false
  const ha = crypto.createHash("sha256").update(a, "utf8").digest()
  const hb = crypto.createHash("sha256").update(b, "utf8").digest()
  return crypto.timingSafeEqual(ha, hb) && a.length === b.length
}

type SavedUpload = { ok: true; fileName: string; originalName: string; fileSize: number; mimeType: string }
type UploadFailure = { ok: false; error: string; status: number; code: ApiErrorCode }

function uploadFailure(status: number, code: ApiErrorCode, error: string): UploadFailure {
  return { ok: false, error, status, code }
}

/** Cheap checks on the declared metadata before any byte is read. */
function checkUploadMeta(file: File | undefined | null): UploadFailure | null {
  if (!file) return uploadFailure(400, "FILE_REQUIRED", "ファイルがありません")
  if (file.size <= 0) return uploadFailure(400, "FILE_EMPTY", "ファイルが空です")
  if (file.size > MAX_UPLOAD_SIZE) return uploadFailure(413, "PAYLOAD_TOO_LARGE", "ファイルサイズが上限を超えています")
  if (!isAllowedMime(file.type || "application/octet-stream")) {
    return uploadFailure(415, "UNSUPPORTED_MEDIA", "許可されていないファイル形式です")
  }
  return null
}

function typeFailure(verdict: Exclude<FileTypeVerdict, { ok: true }>): UploadFailure {
  return verdict.reason === "mismatch"
    ? uploadFailure(415, "FILE_TYPE_MISMATCH", "ファイルの内容が拡張子と一致しません")
    : uploadFailure(415, "UNSUPPORTED_MEDIA", "許可されていないファイル形式です")
}

/**
 * Save an uploaded file to private/uploads/<projectId>/ with a random filename.
 * The client MIME type is only a pre-filter: the first bytes must match the
 * file extension (magic bytes), and the stored type comes from the extension.
 * The body is streamed to disk and its real length is capped at MAX_UPLOAD_SIZE.
 */
export async function saveUploadedFile(projectId: string, file: File): Promise<SavedUpload | UploadFailure> {
  const invalid = checkUploadMeta(file)
  if (invalid) return invalid

  const originalName = file.name || "upload"
  const fileName = `${Date.now()}_${crypto.randomBytes(16).toString("hex")}${safeExtension(path.extname(originalName))}`
  const full = safeFilePath(projectId, fileName)
  if (!full) return uploadFailure(400, "INVALID_PATH", "パスが不正です")

  const reader = file.stream().getReader()
  const head = await readHead(reader, HEAD_BYTES)
  const verdict = verifyFileType(originalName, head.head)
  if (!verdict.ok) {
    await reader.cancel().catch(() => undefined)
    return typeFailure(verdict)
  }

  await fs.mkdir(path.dirname(full), { recursive: true })
  const written = await writeStreamToFile(full, head, reader, MAX_UPLOAD_SIZE)
  if (!written.ok) return uploadFailure(413, "PAYLOAD_TOO_LARGE", "ファイルサイズが上限を超えています")

  return { ok: true, fileName, originalName, fileSize: written.bytes, mimeType: verdict.mimeType }
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
  if (!full) return NextResponse.json({ error: "パスが不正です", code: "INVALID_PATH" }, { status: 400 })

  let stat: import("fs").Stats
  try {
    stat = await (await import("fs/promises")).stat(full)
  } catch {
    return NextResponse.json({ error: "File missing", code: "FILE_MISSING" }, { status: 404 })
  }

  const encoded = encodeURIComponent(originalName)
  const { contentType, disposition } = resolveServeHeaders(mimeType, forceDownload)
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
          "Content-Type": contentType,
          "Content-Disposition": contentDisposition,
          "X-Content-Type-Options": "nosniff",
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
        "Content-Type": contentType,
        "Content-Disposition": contentDisposition,
        "X-Content-Type-Options": "nosniff",
        "Content-Length": String(totalSize),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
      },
    })
  } catch {
    return NextResponse.json({ error: "File missing", code: "FILE_MISSING" }, { status: 404 })
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
 * @deprecated Use `requireProject(projectId, action)` from "@/lib/authz".
 * Legacy shape kept for callers outside src/app/api: explicit members (optionally
 * restricted to `roles`) or system admins (synthetic PO membership). Section
 * managers are not admitted (403). 401 / 404 non-member / 403 role mismatch.
 */
export async function requireProjectMember(
  projectId: string,
  options?: { roles?: string[] }
) {
  const gate = await authorizeProject(projectId, (actor) => {
    if (isSystemAdmin(actor)) return true
    if (actor.projectRole === null) return false
    return !options?.roles || options.roles.includes(actor.projectRole)
  })
  if ("error" in gate) return gate
  const { session, actor } = gate
  return {
    session,
    member: {
      projectId,
      userId: actor.userId,
      role: isSystemAdmin(actor) ? "po" : (actor.projectRole as string),
    },
  }
}

/**
 * Authenticate session only (no membership check).
 */
export async function requireAuth() {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 }) }
  }
  return { session }
}

/**
 * Authenticate session and verify admin role.
 */
export async function requireAdmin() {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 }) }
  }
  if (session.user.role !== "admin") {
    return { error: NextResponse.json({ error: "管理者権限が必要です", code: "ADMIN_REQUIRED" }, { status: 403 }) }
  }
  return { session }
}

/**
 * @deprecated Use `requireProject(projectId, action)` from "@/lib/authz".
 * Legacy scopes: "read" → project.view, "icebox" → icebox.write,
 * "memberWrite" → any explicit member, "po" → PO only.
 */
export type ProjectAccessScope = "read" | "icebox" | "po" | "memberWrite"

const LEGACY_SCOPE_CHECK: Record<ProjectAccessScope, (actor: ProjectActor) => boolean> = {
  read: (actor) => can(actor, "project.view"),
  icebox: (actor) => can(actor, "icebox.write"),
  memberWrite: (actor) => isSystemAdmin(actor) || actor.projectRole !== null,
  po: (actor) => isSystemAdmin(actor) || actor.projectRole === "po",
}

/** @deprecated Use `requireProject(projectId, action)` from "@/lib/authz". */
export async function requireProjectAccess(projectId: string, scope: ProjectAccessScope = "read") {
  const gate = await authorizeProject(projectId, LEGACY_SCOPE_CHECK[scope])
  if ("error" in gate) return gate
  const member = gate.actor.projectRole !== null ? { role: gate.actor.projectRole } : null
  return { session: gate.session, member, via: gate.via }
}
