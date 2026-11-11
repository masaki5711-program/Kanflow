import crypto from "crypto"
import fs from "fs/promises"
import path from "path"
import { BOARD_LIMITS } from "@/lib/board/limits"
import { HEAD_BYTES, verifyFileType } from "@/lib/upload/file-type"
import { safeFilePath } from "@/lib/upload/stored-files"
import { readHead, writeStreamToFile } from "@/lib/upload/stream-write"
import { StatusError, ValidationError } from "@/services/_shared/errors"

/**
 * Storing a board image. Only raster images the browser shows inline: no SVG (it can carry script) and no other
 * file type. The browser's name and MIME type only pick the extension; the first bytes must match it, and the
 * stored type comes from the content check. The body is streamed to disk and cut at the size limit.
 */

const IMAGE_EXTENSIONS: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
}
const ALLOWED = new Set(Object.keys(IMAGE_EXTENSIONS))
const NAME_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp"])

/** The extension to check the content against: the file name's when it is an image one, else the declared type's. */
export function imageExtension(name: string, declaredType: string): string | null {
  const fromName = path.extname(name).slice(1).toLowerCase()
  if (NAME_EXTENSIONS.has(fromName)) return fromName
  return IMAGE_EXTENSIONS[declaredType.toLowerCase()] ?? null
}

const notImage = () => new StatusError(415, "Only PNG, JPEG, GIF or WebP images", {}, "BOARD_IMAGE_TYPE")
const tooLarge = () => new StatusError(413, "Image too large", { maxBytes: BOARD_LIMITS.imageBytes }, "PAYLOAD_TOO_LARGE")

export interface SavedBoardImage {
  fileName: string
  mimeType: string
  fileSize: number
}

export async function saveBoardImage(projectId: string, file: File): Promise<SavedBoardImage> {
  if (file.size <= 0) throw new ValidationError("Empty file", {}, "FILE_EMPTY")
  if (file.size > BOARD_LIMITS.imageBytes) throw tooLarge()
  const ext = imageExtension(file.name || "", file.type || "")
  if (!ext) throw notImage()

  const fileName = `board_${Date.now()}_${crypto.randomBytes(16).toString("hex")}.${ext}`
  const full = safeFilePath(projectId, fileName)
  if (!full) throw new ValidationError("Invalid path", {}, "INVALID_PATH")

  const reader = file.stream().getReader()
  const head = await readHead(reader, HEAD_BYTES)
  const verdict = verifyFileType(`image.${ext}`, head.head)
  if (!verdict.ok || !ALLOWED.has(verdict.mimeType)) {
    await reader.cancel().catch(() => undefined)
    throw notImage()
  }
  await fs.mkdir(path.dirname(full), { recursive: true })
  const written = await writeStreamToFile(full, head, reader, BOARD_LIMITS.imageBytes)
  if (!written.ok) throw tooLarge()
  return { fileName, mimeType: verdict.mimeType, fileSize: written.bytes }
}
