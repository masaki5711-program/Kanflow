/**
 * Shared pieces of the Excel exports / import (P4): file naming, download
 * headers, the viewer's workbook language, Tokyo-time Excel dates and a
 * table-sheet builder (bold frozen header row, autofilter, column widths).
 */
import ExcelJS from "exceljs"
import type { Language } from "@/lib/i18n"

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

/** Excel's hard limit of characters in one cell. */
export const EXCEL_TEXT_MAX = 32_767

export const EXCEL_LANGS: readonly Language[] = ["ja", "en", "id"]
const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000

export type ExcelCell = string | number | Date | null

export interface ExcelColumn<R> {
  key: string
  header: string
  width: number
  /** date / datetime get a number format; the value must come from `excelDate`. */
  type?: "text" | "number" | "date" | "datetime"
  value: (row: R) => ExcelCell
}

/** `?lang=` when it is a supported language, else `fallback`. */
export function parseExcelLang(raw: string | null | undefined, fallback: Language): Language {
  return EXCEL_LANGS.includes(raw as Language) ? (raw as Language) : fallback
}

/** YYYY-MM-DD of `now` in Tokyo. */
export function tokyoDate(now: Date): string {
  return new Date(now.getTime() + TOKYO_OFFSET_MS).toISOString().slice(0, 10)
}

/**
 * Excel dates carry no time zone and exceljs writes a Date's UTC fields, so
 * shift by +9h: the cell then shows the Tokyo wall-clock time.
 */
export function excelDate(d: Date | null | undefined): Date | null {
  return d ? new Date(d.getTime() + TOKYO_OFFSET_MS) : null
}

/** Text for a cell: empty → null (a blank cell), cut to the Excel cell limit. */
export function excelCellText(s: string | null | undefined): string | null {
  if (!s) return null
  return s.length > EXCEL_TEXT_MAX ? s.slice(0, EXCEL_TEXT_MAX) : s
}

/** "<kind>-<project>-<YYYY-MM-DD>.xlsx" (Tokyo date) with characters unsafe in file names replaced. */
export function excelFileName(kind: string, projectName: string, now: Date): string {
  const safe = projectName.replace(/[\\/:*?"<>|\u0000-\u001f\s]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "project"
  return `${kind}-${safe}-${tokyoDate(now)}.xlsx`
}

/** Content-Disposition with an ASCII fallback and the UTF-8 name (RFC 6266 / 5987). */
export function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "_")
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}

/** Sheet name Excel accepts: no []:*?/\ and at most 31 characters. */
export function safeSheetName(name: string): string {
  const cleaned = name.replace(/[[\]:*?/\\]/g, "_").slice(0, 31)
  return cleaned.trim() || "Sheet"
}

const NUM_FMT: Partial<Record<NonNullable<ExcelColumn<unknown>["type"]>, string>> = {
  date: "yyyy-mm-dd",
  datetime: "yyyy-mm-dd hh:mm",
}

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } }

/**
 * A table sheet: header row bold, shaded and frozen (plus the first `xSplit`
 * columns), autofilter over the header, fixed widths, wrapped long text.
 */
export function addTableSheet<R>(
  wb: ExcelJS.Workbook,
  name: string,
  columns: readonly ExcelColumn<R>[],
  rows: readonly R[],
  opts: { xSplit?: number } = {}
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(safeSheetName(name), { views: [{ state: "frozen", ySplit: 1, xSplit: opts.xSplit ?? 0 }] })
  ws.columns = columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width,
    style: NUM_FMT[c.type ?? "text"] ? { numFmt: NUM_FMT[c.type ?? "text"] } : { alignment: { vertical: "top", wrapText: c.width >= 30 } },
  }))
  for (const r of rows) ws.addRow(Object.fromEntries(columns.map((c) => [c.key, c.value(r)])))
  const header = ws.getRow(1)
  header.font = { bold: true }
  header.eachCell((cell) => {
    cell.fill = HEADER_FILL
    cell.alignment = { vertical: "middle" }
  })
  if (columns.length > 0) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } }
  return ws
}

/** Parse xlsx bytes (Node Buffer or exceljs' own buffer type). */
export async function loadWorkbook(data: Uint8Array | ExcelJS.Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(data as unknown as ExcelJS.Buffer)
  return wb
}

export async function workbookBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await wb.xlsx.writeBuffer())
}

/** The download response of a built workbook. */
export function xlsxResponse(buffer: Buffer, fileName: string): Response {
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": contentDisposition(fileName),
      "Cache-Control": "no-store",
    },
  })
}
