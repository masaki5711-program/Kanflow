import { readFile } from "fs/promises"
import path from "path"

/**
 * Reads an attachment from the project uploads directory and returns its
 * extracted plain-text content. Format is auto-detected from mime type with
 * file extension as fallback. Returns an error message in `error` if the
 * file cannot be parsed, so the LLM can relay it instead of failing silently.
 */
export type ExtractResult =
  | { ok: true; text: string; truncated: boolean; format: string }
  | { ok: false; error: string }

const MAX_CHARS = 60_000

function uploadsRoot(): string {
  return path.join(process.cwd(), "private", "uploads")
}

function safeJoin(projectId: string, fileName: string): string | null {
  const root = uploadsRoot()
  const resolved = path.resolve(root, projectId, fileName)
  return resolved.startsWith(root + path.sep) ? resolved : null
}

function truncate(text: string): { text: string; truncated: boolean } {
  const collapsed = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
  if (collapsed.length <= MAX_CHARS) return { text: collapsed, truncated: false }
  return { text: collapsed.slice(0, MAX_CHARS) + "\n\n…[truncated]", truncated: true }
}

async function extractPdf(filePath: string): Promise<string> {
  const mod = (await import("pdf-parse")) as unknown as {
    default?: (b: Buffer) => Promise<{ text: string }>
  }
  const fn = mod.default ?? (mod as unknown as (b: Buffer) => Promise<{ text: string }>)
  const buf = await readFile(filePath)
  const data = await fn(buf)
  return data.text
}

async function extractDocx(filePath: string): Promise<string> {
  const mammoth = (await import("mammoth")) as unknown as {
    extractRawText: (opts: { path: string }) => Promise<{ value: string }>
  }
  const result = await mammoth.extractRawText({ path: filePath })
  return result.value
}

async function extractXlsx(filePath: string): Promise<string> {
  // Recent xlsx releases ship without an auto-bound fs in Node, so readFile()
  // throws. Reading the buffer ourselves and using read() is the supported
  // path and works for both .xlsx and .xls.
  const XLSX = (await import("xlsx")) as unknown as typeof import("xlsx")
  const buf = await readFile(filePath)
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true })
  const parts: string[] = []
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName]
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false })
    parts.push(`# Sheet: ${sheetName}\n${csv}`)
  }
  return parts.join("\n\n")
}

async function extractPptx(filePath: string): Promise<string> {
  type PptxParser = new (path: string) => {
    extractText: () => Promise<unknown>
  }
  const mod = (await import("pptx-text-parser")) as unknown as {
    default?: PptxParser
  } & PptxParser
  const Ctor = mod.default ?? mod
  const parser = new Ctor(filePath)
  const out = await parser.extractText()
  if (typeof out === "string") return out
  if (Array.isArray(out)) return out.map((v) => (typeof v === "string" ? v : JSON.stringify(v))).join("\n")
  if (out && typeof out === "object") {
    return Object.entries(out as Record<string, unknown>)
      .map(([slide, body]) => `# ${slide}\n${typeof body === "string" ? body : JSON.stringify(body)}`)
      .join("\n\n")
  }
  return ""
}

async function extractPlainText(filePath: string): Promise<string> {
  const buf = await readFile(filePath)
  return buf.toString("utf8")
}

function detectFormat(mime: string, fileName: string): string | null {
  const ext = path.extname(fileName).toLowerCase()
  if (mime.includes("pdf") || ext === ".pdf") return "pdf"
  if (mime.includes("wordprocessingml") || ext === ".docx") return "docx"
  if (mime.includes("spreadsheetml") || mime.includes("ms-excel") || ext === ".xlsx" || ext === ".xls") return "xlsx"
  if (mime.includes("presentationml") || mime.includes("ms-powerpoint") || ext === ".pptx" || ext === ".ppt") return "pptx"
  if (
    mime.startsWith("text/") ||
    [".txt", ".md", ".csv", ".tsv", ".log", ".json", ".xml", ".yaml", ".yml"].includes(ext)
  ) return "text"
  return null
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
      error: `unsupported format (mime=${args.mimeType}). Supported: pdf, docx, xlsx, pptx, text/*`,
    }
  }

  try {
    let raw = ""
    switch (format) {
      case "pdf": raw = await extractPdf(fullPath); break
      case "docx": raw = await extractDocx(fullPath); break
      case "xlsx": raw = await extractXlsx(fullPath); break
      case "pptx": raw = await extractPptx(fullPath); break
      case "text": raw = await extractPlainText(fullPath); break
    }
    const { text, truncated } = truncate(raw)
    return { ok: true, text, truncated, format }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `extraction failed: ${message}` }
  }
}
