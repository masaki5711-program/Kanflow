import { open, stat } from "fs/promises"
import path from "path"
import {
  MAX_CHARS,
  MAX_EXTRACT_BYTES,
  detectFormat,
  isLegacyFormat,
  truncateText,
} from "@/lib/extraction/formats"
import { runExtraction } from "@/lib/extraction/runner"

/**
 * Reads an attachment from the project uploads directory and returns its
 * extracted plain-text content. Format is auto-detected from mime type with
 * file extension as fallback. Returns an error message in `error` if the
 * file cannot be parsed, so the LLM can relay it instead of failing silently.
 *
 * Binary formats (pdf/docx/xlsx/pptx) are parsed in a worker thread with a
 * timeout and concurrency limit so a large or hostile file cannot block the
 * Next.js event loop.
 */
export type ExtractResult =
  | { ok: true; text: string; truncated: boolean; format: string }
  | { ok: false; error: string }

/** Plain-text files: read only enough bytes to fill MAX_CHARS (UTF-8 is at most 4 bytes/char). */
const MAX_TEXT_READ_BYTES = MAX_CHARS * 4

function uploadsRoot(): string {
  return path.join(process.cwd(), "private", "uploads")
}

function safeJoin(projectId: string, fileName: string): string | null {
  const root = uploadsRoot()
  const resolved = path.resolve(root, projectId, fileName)
  return resolved.startsWith(root + path.sep) ? resolved : null
}

async function readTextHead(filePath: string, size: number): Promise<{ text: string; clipped: boolean }> {
  const length = Math.min(size, MAX_TEXT_READ_BYTES)
  const handle = await open(filePath, "r")
  try {
    const buf = Buffer.alloc(length)
    const { bytesRead } = await handle.read(buf, 0, length, 0)
    return { text: buf.subarray(0, bytesRead).toString("utf8"), clipped: size > length }
  } finally {
    await handle.close()
  }
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

export async function extractAttachment(args: {
  projectId: string
  fileName: string
  mimeType: string
  originalName: string
}): Promise<ExtractResult> {
  const fullPath = safeJoin(args.projectId, args.fileName)
  if (!fullPath) return { ok: false, error: "invalid path" }

  const format = detectFormat(args.mimeType ?? "", args.originalName ?? args.fileName)
  if (!format) {
    return {
      ok: false,
      error: `unsupported format (mime=${args.mimeType}). Supported: pdf, docx, xlsx, pptx, csv, text/*`,
    }
  }
  if (isLegacyFormat(format)) {
    return {
      ok: false,
      error: `unsupported legacy format (.${format}). Please save the file as .${format}x and re-upload to analyze it.`,
    }
  }

  try {
    const { size } = await stat(fullPath)
    if (size > MAX_EXTRACT_BYTES) {
      return {
        ok: false,
        error: `file too large to analyze (${formatMb(size)} > ${formatMb(MAX_EXTRACT_BYTES)}). The file is stored but its content cannot be read.`,
      }
    }

    if (format === "text") {
      const { text: raw, clipped } = await readTextHead(fullPath, size)
      const { text, truncated } = truncateText(raw, clipped)
      return { ok: true, text, truncated, format }
    }

    const outcome = await runExtraction({ format, filePath: fullPath })
    if (!outcome.ok) return { ok: false, error: `extraction failed: ${outcome.error}` }
    const { text, truncated } = truncateText(outcome.value.text, outcome.value.clipped)
    return { ok: true, text, truncated, format }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `extraction failed: ${message}` }
  }
}
