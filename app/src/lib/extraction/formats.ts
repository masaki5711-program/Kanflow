import path from "path"

/** Max characters of extracted text handed to the LLM. */
export const MAX_CHARS = 60_000
/** Files larger than this are stored but not analyzed. */
export const MAX_EXTRACT_BYTES = 50 * 1024 * 1024
/** Hard wall-clock limit per extraction worker. */
export const EXTRACT_TIMEOUT_MS = 60_000
/** Parallel extraction workers (each can use a full core). */
export const MAX_CONCURRENT_EXTRACTIONS = 2
/** Pending extractions allowed to wait for a free worker. */
export const MAX_QUEUED_EXTRACTIONS = 20

/** Formats parsed inside the worker thread. */
export type WorkerFormat = "pdf" | "docx" | "xlsx" | "pptx"
/** Formats that are recognized but cannot be parsed (legacy binary Office). */
export type LegacyFormat = "xls" | "ppt" | "doc"
export type DetectedFormat = WorkerFormat | LegacyFormat | "text"

const TEXT_EXTENSIONS = [".txt", ".md", ".csv", ".tsv", ".log", ".json", ".xml", ".yaml", ".yml"]

export function detectFormat(mime: string, fileName: string): DetectedFormat | null {
  const ext = path.extname(fileName).toLowerCase()
  if (mime.includes("pdf") || ext === ".pdf") return "pdf"
  if (mime.includes("wordprocessingml") || ext === ".docx") return "docx"
  if (mime.includes("spreadsheetml") || ext === ".xlsx") return "xlsx"
  if (mime.includes("presentationml") || ext === ".pptx") return "pptx"
  if (mime.includes("ms-excel") || ext === ".xls") return "xls"
  if (mime.includes("ms-powerpoint") || ext === ".ppt") return "ppt"
  if (mime === "application/msword" || ext === ".doc") return "doc"
  if (mime.startsWith("text/") || TEXT_EXTENSIONS.includes(ext)) return "text"
  return null
}

export function isWorkerFormat(format: DetectedFormat): format is WorkerFormat {
  return format === "pdf" || format === "docx" || format === "xlsx" || format === "pptx"
}

export function isLegacyFormat(format: DetectedFormat): format is LegacyFormat {
  return format === "xls" || format === "ppt" || format === "doc"
}

export function truncateText(text: string, forceTruncated = false): { text: string; truncated: boolean } {
  const collapsed = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
  if (collapsed.length <= MAX_CHARS && !forceTruncated) return { text: collapsed, truncated: false }
  return { text: collapsed.slice(0, MAX_CHARS) + "\n\n…[truncated]", truncated: true }
}
