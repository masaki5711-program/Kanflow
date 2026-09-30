/* eslint-disable @typescript-eslint/no-require-imports */
"use strict"

/**
 * Attachment text-extraction worker (runs as a forked child process).
 *
 * Kept as a plain CommonJS file OUTSIDE the Next.js bundle on purpose:
 * webpack/turbopack cannot reliably bundle worker entry points, so the server
 * forks this file by absolute path (path.join(process.cwd(), "workers", ...))
 * and the parser libraries are resolved from node_modules at runtime.
 *
 * A child process (not worker_threads) is used because pdf-parse v2 loads the
 * native @napi-rs/canvas addon, which segfaults the WHOLE process when a
 * worker thread is torn down. A separate process also isolates parser crashes
 * and memory blow-ups from the Next.js server.
 *
 * Protocol (IPC):
 *   parent sends one message: { format: "pdf" | "docx" | "xlsx" | "pptx", filePath: string, maxChars: number }
 *   child replies exactly once: { ok: true, text, clipped } | { ok: false, error }, then exits.
 *
 * The parent enforces the timeout (kill) and heap cap (--max-old-space-size).
 */

const { readFile } = require("node:fs/promises")

async function extractPdf(filePath) {
  const { PDFParse } = require("pdf-parse")
  const data = await readFile(filePath)
  const parser = new PDFParse({ data: new Uint8Array(data) })
  try {
    const result = await parser.getText()
    return result.text
  } finally {
    await parser.destroy().catch(() => undefined)
  }
}

async function extractDocx(filePath) {
  const mammoth = require("mammoth")
  const result = await mammoth.extractRawText({ path: filePath })
  return result.value
}

function cellToString(value) {
  if (value === null || value === undefined) return ""
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString()
  if (typeof value !== "object") return String(value)
  if (Array.isArray(value.richText)) return value.richText.map((r) => r.text ?? "").join("")
  if ("result" in value) return cellToString(value.result)
  if ("formula" in value || "sharedFormula" in value) return ""
  if ("text" in value) return cellToString(value.text)
  if ("error" in value) return String(value.error)
  return ""
}

function csvEscape(text) {
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function rowToCsv(row) {
  // row.values is a sparse, 1-based array (index 0 is always empty).
  const values = Array.isArray(row.values) ? row.values : []
  const cells = []
  for (let col = 1; col < values.length; col += 1) {
    cells.push(csvEscape(cellToString(values[col])))
  }
  while (cells.length > 0 && cells[cells.length - 1] === "") cells.pop()
  return cells.join(",")
}

async function extractXlsx(filePath, maxChars) {
  const ExcelJS = require("exceljs")
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)
  const parts = []
  let size = 0
  for (const sheet of workbook.worksheets) {
    const lines = [`# Sheet: ${sheet.name}`]
    sheet.eachRow({ includeEmpty: false }, (row) => {
      if (size > maxChars) return
      const line = rowToCsv(row)
      if (line === "") return
      lines.push(line)
      size += line.length + 1
    })
    parts.push(lines.join("\n"))
    if (size > maxChars) break
  }
  return parts.join("\n\n")
}

async function extractPptx(filePath) {
  const extractTextFromPPTX = require("pptx-text-parser")
  const out = await extractTextFromPPTX(filePath, "text")
  return typeof out === "string" ? out : ""
}

async function extractByFormat(format, filePath, maxChars) {
  switch (format) {
    case "pdf": return extractPdf(filePath)
    case "docx": return extractDocx(filePath)
    case "xlsx": return extractXlsx(filePath, maxChars)
    case "pptx": return extractPptx(filePath)
    default: throw new Error(`worker cannot extract format: ${format}`)
  }
}

function reply(msg) {
  // Exit only after the message has been flushed over IPC.
  process.send(msg, () => process.exit(0))
}

async function handleJob(job) {
  const { format, filePath, maxChars } = job
  try {
    const raw = await extractByFormat(format, filePath, maxChars)
    // Clip before replying so a huge document is not serialized over IPC;
    // the parent does the final normalization/truncation.
    const limit = maxChars * 2
    const clipped = raw.length > limit
    reply({ ok: true, text: clipped ? raw.slice(0, limit) : raw, clipped })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    reply({ ok: false, error: message })
  }
}

if (require.main === module && typeof process.send === "function") {
  process.once("message", (job) => {
    const valid = job && typeof job === "object" && typeof job.filePath === "string"
      && typeof job.format === "string" && Number.isInteger(job.maxChars) && job.maxChars > 0
    if (!valid) {
      reply({ ok: false, error: "invalid job" })
      return
    }
    handleJob(job)
  })
  // Parent went away (e.g. server restart): nobody to report to.
  process.once("disconnect", () => process.exit(0))
}

module.exports = { extractByFormat, cellToString, csvEscape }
