import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { runExtraction } from "@/lib/extraction/runner"
import type { WorkerFormat } from "@/lib/extraction/formats"
import type { FileKind } from "./repo-index-rules"
import { redactSecrets } from "./repo-redact"

/**
 * Downloaded repository file → plain text for chunking (secrets masked).
 * Text files are decoded as UTF-8 (binary content is refused); Office / PDF
 * files go through the same sandboxed extraction worker as attachments
 * (lib/extraction/runner), via a private temp file deleted right after.
 */

export type ContentResult = { ok: true; text: string } | { ok: false; reason: "binary" | "extraction" | "empty" }

/** NUL bytes in the first 8 KB mean the file is not text (same heuristic as git). */
const BINARY_SNIFF_BYTES = 8000

export function looksBinary(data: Buffer): boolean {
  return data.subarray(0, BINARY_SNIFF_BYTES).includes(0)
}

function workerFormatOf(filePath: string): WorkerFormat | null {
  const ext = path.extname(filePath).slice(1).toLowerCase()
  return ext === "pdf" || ext === "docx" || ext === "xlsx" || ext === "pptx" ? ext : null
}

async function extractOffice(filePath: string, data: Buffer): Promise<ContentResult> {
  const format = workerFormatOf(filePath)
  if (!format) return { ok: false, reason: "extraction" }
  const dir = await mkdtemp(path.join(os.tmpdir(), "kanflow-repo-"))
  try {
    const tmp = path.join(dir, `file.${format}`)
    await writeFile(tmp, data, { mode: 0o600 })
    const outcome = await runExtraction({ format, filePath: tmp })
    return outcome.ok ? { ok: true, text: outcome.value.text } : { ok: false, reason: "extraction" }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

/** Text of one file, with secret-looking values redacted. */
export async function fileText(filePath: string, kind: FileKind, data: Buffer, extract = extractOffice): Promise<ContentResult> {
  let result: ContentResult
  if (kind === "office") result = await extract(filePath, data)
  else result = looksBinary(data) ? { ok: false, reason: "binary" } : { ok: true, text: data.toString("utf8") }
  if (!result.ok) return result
  if (!result.text.trim()) return { ok: false, reason: "empty" }
  return { ok: true, text: redactSecrets(result.text) }
}
