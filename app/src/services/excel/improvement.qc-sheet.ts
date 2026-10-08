/**
 * One A3-landscape QC-story sheet per improvement (改善成果ボード export):
 * テーマ, then two columns — 現状把握 / 目標 / 対策 on the left, 効果 / 標準化 /
 * 横展開 on the right — and the 定着確認 table across the bottom, printed on
 * one A3 page.
 */
import type ExcelJS from "exceljs"
import type { Translations } from "@/lib/i18n"
import {
  categoryLabel,
  checkKindLabel,
  checkResultLabel,
  directionLabel,
  rolloutStatusLabel,
  stageLabel,
} from "@/lib/improvement/labels"
import { achievementRate } from "@/lib/improvement/metrics"
import { excelCellText, excelDate, safeSheetName } from "./excel.shared"

export interface QcItem {
  title: string
  theme: string | null
  countermeasure: string | null
  assignedPo: string | null
  kaizenStage: string
  metricCategory: string | null
  metricName: string | null
  metricUnit: string | null
  direction: string
  baselineValue: number | null
  targetValue: number | null
  resultValue: number | null
  annualEffectUsd: number | null
  spaceSavedM2: number | null
  manualLink: string | null
  standardizedAt: Date | null
  releaseDate: Date | null
  rollouts: ReadonlyArray<{ targetName: string; status: string; doneAt: Date | null }>
  checks: ReadonlyArray<{ kind: string; dueDate: Date; result: string | null; checkedAt: Date | null; checkedByName: string | null; note: string | null }>
  photoCounts: { before: number; after: number }
}

/** OOXML paper size 8 = A3 (not in exceljs' PaperSize enum). */
export const A3_PAPER = 8 as ExcelJS.PaperSize

const COLS = 8
const HALF = COLS / 2
const HEAD_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } }
const THIN: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FF94A3B8" } }
const BOX: Partial<ExcelJS.Borders> = { top: THIN, left: THIN, bottom: THIN, right: THIN }

type Cell = string | number | Date | null

function put(ws: ExcelJS.Worksheet, row: number, from: number, to: number, value: Cell, style: Partial<ExcelJS.Style> = {}): ExcelJS.Cell {
  if (to > from) ws.mergeCells(row, from, row, to)
  const cell = ws.getCell(row, from)
  cell.value = value
  cell.style = { alignment: { vertical: "top", wrapText: true }, border: BOX, ...style }
  return cell
}

function heading(ws: ExcelJS.Worksheet, row: number, from: number, to: number, text: string): void {
  put(ws, row, from, to, text, { font: { bold: true }, fill: HEAD_FILL, alignment: { vertical: "middle" } })
}

/** label | value (value spans the rest of the half). */
function pair(ws: ExcelJS.Worksheet, row: number, from: number, label: string, value: Cell, numFmt?: string): void {
  put(ws, row, from, from, label, { font: { bold: true } })
  put(ws, row, from + 1, from + HALF - 1, value, numFmt ? { numFmt, alignment: { horizontal: "left" } } : {})
}

function withUnit(value: number | null, unit: string | null): string | null {
  return value === null ? null : unit ? `${value} ${unit}` : String(value)
}

function header(ws: ExcelJS.Worksheet, item: QcItem, t: Translations, meta: { projectName: string; created: Date }): void {
  put(ws, 1, 1, COLS, t.kzXlsReportTitle, { font: { bold: true, size: 16 }, border: {}, alignment: { vertical: "middle" } })
  pair(ws, 2, 1, t.kzXlsProject, meta.projectName)
  pair(ws, 2, HALF + 1, t.kzXlsCreated, excelDate(meta.created), "yyyy-mm-dd")
  pair(ws, 3, 1, t.kzXlsOwner, excelCellText(item.assignedPo))
  pair(ws, 3, HALF + 1, t.kzXlsStage, stageLabel(item.kaizenStage, t))
  heading(ws, 5, 1, COLS, t.kzXlsTheme)
  put(ws, 6, 1, COLS, excelCellText([item.theme, item.title].filter(Boolean).join("\n")), { font: { bold: true, size: 13 } })
  ws.getRow(6).height = 36
}

function leftColumn(ws: ExcelJS.Worksheet, item: QcItem, t: Translations): void {
  const metric = [categoryLabel(item.metricCategory, t), item.metricName].filter(Boolean).join(" / ")
  heading(ws, 8, 1, HALF, t.kzXlsCurrent)
  pair(ws, 9, 1, t.kzXlsMetric, excelCellText(metric))
  pair(ws, 10, 1, t.kzBefore, withUnit(item.baselineValue, item.metricUnit))
  heading(ws, 12, 1, HALF, t.kzXlsGoal)
  pair(ws, 13, 1, t.kzTarget, withUnit(item.targetValue, item.metricUnit))
  pair(ws, 14, 1, t.kzDirection, directionLabel(item.direction, t))
  heading(ws, 16, 1, HALF, t.kzXlsCountermeasure)
  ws.mergeCells(17, 1, 24, HALF)
  put(ws, 17, 1, 1, excelCellText(item.countermeasure))
}

function rightColumn(ws: ExcelJS.Worksheet, item: QcItem, t: Translations): void {
  const c = HALF + 1
  heading(ws, 8, c, COLS, t.kzXlsEffect)
  pair(ws, 9, c, t.kzAfter, withUnit(item.resultValue, item.metricUnit))
  pair(ws, 10, c, t.kzAchievement, achievementRate(item), "0%")
  pair(ws, 11, c, t.kzAnnualEffect, item.annualEffectUsd, "$#,##0")
  pair(ws, 12, c, t.kzSpaceSaved, item.spaceSavedM2, "#,##0.00")
  heading(ws, 13, c, COLS, t.kzXlsStandard)
  pair(ws, 14, c, t.kzStandardLink, excelCellText(item.manualLink))
  pair(ws, 15, c, t.kzStandardizedAt, excelDate(item.standardizedAt), "yyyy-mm-dd")
  heading(ws, 16, c, COLS, t.kzXlsRollout)
  const rows = item.rollouts.slice(0, 8)
  rows.forEach((r, i) => {
    put(ws, 17 + i, c, c + 1, excelCellText(r.targetName))
    put(ws, 17 + i, c + 2, c + 2, rolloutStatusLabel(r.status, t))
    put(ws, 17 + i, c + 3, c + 3, excelDate(r.doneAt), { numFmt: "yyyy-mm-dd" })
  })
  if (rows.length === 0) put(ws, 17, c, COLS, t.kzRolloutNone)
}

function checksTable(ws: ExcelJS.Worksheet, item: QcItem, t: Translations): number {
  const top = 26
  heading(ws, top, 1, COLS, `${t.kzXlsChecks}（${t.kzReleaseDate}: ${item.releaseDate ? item.releaseDate.toISOString().slice(0, 10) : "—"}）`)
  const head = [t.kzXlsChecks, t.kzCheckDue.replace("{date}", "").trim(), t.kzXlsResult, t.kzXlsCheckedBy, t.kzCheckNote]
  head.forEach((h, i) => put(ws, top + 1, i === 4 ? 5 : i + 1, i === 4 ? COLS : i + 1, h, { font: { bold: true } }))
  item.checks.forEach((ch, i) => {
    const row = top + 2 + i
    put(ws, row, 1, 1, checkKindLabel(ch.kind, t))
    put(ws, row, 2, 2, excelDate(ch.dueDate), { numFmt: "yyyy-mm-dd" })
    put(ws, row, 3, 3, checkResultLabel(ch.result, t))
    put(ws, row, 4, 4, excelCellText(ch.checkedByName))
    put(ws, row, 5, COLS, excelCellText(ch.note))
  })
  return top + 2 + item.checks.length
}

/** Add the QC-story sheet of one improvement (`index` keeps sheet names unique). */
export function addQcStorySheet(
  wb: ExcelJS.Workbook,
  item: QcItem,
  index: number,
  t: Translations,
  meta: { projectName: string; created: Date }
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(safeSheetName(`${index + 1}_${item.title}`), {
    pageSetup: { paperSize: A3_PAPER, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 1, horizontalCentered: true },
  })
  ws.columns = Array.from({ length: COLS }, (_, i) => ({ width: i % HALF === 0 ? 16 : 24 }))
  header(ws, item, t, meta)
  leftColumn(ws, item, t)
  rightColumn(ws, item, t)
  const end = checksTable(ws, item, t)
  const note = t.kzXlsReportNote.replace("{before}", String(item.photoCounts.before)).replace("{after}", String(item.photoCounts.after))
  put(ws, end + 1, 1, COLS, `${t.kzXlsPhotos}: ${note}`, { border: {}, font: { italic: true, color: { argb: "FF475569" } } })
  ws.pageSetup.printArea = `A1:H${end + 1}`
  return ws
}
