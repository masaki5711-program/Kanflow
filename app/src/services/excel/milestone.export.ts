/**
 * GET /milestones/export: the マイルストーン・検収ボード as an .xlsx —
 * サマリー (stages + totals + 予算), the チェック項目 record with 立会者 /
 * 確認者 signature columns (milestone.check-sheet.ts), 残課題リスト and the
 * 引き渡し資料 checklist, plus 推移 when metrics exist. Landscape, fit to width.
 */
import ExcelJS from "exceljs"
import { getTranslations, type Language, type Translations } from "@/lib/i18n"
import { pickText } from "@/lib/translation/pick-text"
import type { EntityI18n } from "@/lib/translation/types"
import { getBoard, type MilestoneBoardDto } from "@/services/milestones/milestones.service"
import { defaultDb } from "@/services/_shared/db"
import { findExportProject } from "./excel.project"
import { addTableSheet, excelCellText, excelDate, excelFileName, tokyoDate, workbookBuffer, type ExcelColumn } from "./excel.shared"
import { A3_PAPER } from "./improvement.qc-sheet"
import { A4_PAPER, addCheckSheet, checkLabelOf, dayCell } from "./milestone.check-sheet"

type Stage = MilestoneBoardDto["stages"][number]
type Punch = MilestoneBoardDto["punchItems"][number]
type Doc = MilestoneBoardDto["documents"][number]

const LANDSCAPE = (paperSize: ExcelJS.PaperSize): Partial<ExcelJS.PageSetup> => ({ paperSize, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 })

export function stageStatusLabel(status: string, t: Translations): string {
  const map: Record<string, string> = { not_started: t.msStatusNotStarted, in_progress: t.msStatusInProgress, done: t.msStatusDone, on_hold: t.msStatusOnHold }
  return map[status] ?? status
}

export function punchStatusLabel(status: string, t: Translations): string {
  const map: Record<string, string> = { open: t.msPunchStatusOpen, in_progress: t.msPunchStatusInProgress, done: t.msPunchStatusDone }
  return map[status] ?? status
}

function stageColumns(t: Translations, lang: Language): ExcelColumn<Stage>[] {
  return [
    { key: "name", header: t.msXlsStage, width: 32, value: (s) => excelCellText(pickText(s.i18n as EntityI18n, "name", s.name, lang).text) },
    { key: "status", header: t.msStatus, width: 12, value: (s) => (s.scheduleState === "delayed" ? `${stageStatusLabel(s.status, t)} (${t.msLate})` : stageStatusLabel(s.status, t)) },
    { key: "ps", header: t.msPlannedStart, width: 13, type: "date", value: (s) => dayCell(s.plannedStart) },
    { key: "pe", header: t.msPlannedEnd, width: 13, type: "date", value: (s) => dayCell(s.plannedEnd) },
    { key: "as", header: t.msActualStart, width: 13, type: "date", value: (s) => dayCell(s.actualStart) },
    { key: "ae", header: t.msActualEnd, width: 13, type: "date", value: (s) => dayCell(s.actualEnd) },
    { key: "cond", header: t.msXlsConditions, width: 12, value: (s) => (s.conditions.length ? `${s.conditions.filter((c) => c.checked).length}/${s.conditions.length}` : null) },
  ]
}

/** サマリー: header lines, the stage table, the totals and (when on) the 予算 lines. */
function addSummarySheet(wb: ExcelJS.Workbook, board: MilestoneBoardDto, t: Translations, lang: Language, meta: ExportMeta): void {
  const ws = addTableSheet(wb, t.msXlsSummarySheet, stageColumns(t, lang), board.stages)
  ws.pageSetup = LANDSCAPE(A4_PAPER)
  const label = checkLabelOf(board, t)
  const s = board.summary
  const lines: Array<[string, string | number | null]> = [
    [t.msXlsProject, meta.projectName],
    [t.msXlsTemplates, board.templates.join(" / ") || null],
    [t.msXlsCreated, tokyoDate(meta.created)],
    [t.msSumStages, t.msSumStagesDone.replace("{done}", String(s.stages.done)).replace("{total}", String(s.stages.total))],
    [t.msLate, s.stages.late],
    [label, `${s.checks.passed}/${s.checks.total}${s.checks.complete ? ` (${t.msAccepted})` : ""}`],
    [t.msSumPunch, `${s.punch.open} ${t.msSumPunchOpen} / ${t.msSumPunchOverdue.replace("{n}", String(s.punch.overdue))}`],
    [t.msSumDocs, `${s.documents.received}/${s.documents.total}`],
  ]
  let row = board.stages.length + 3
  ws.getCell(row, 1).value = t.msXlsTotals
  ws.getCell(row, 1).font = { bold: true }
  for (const [key, value] of lines) {
    row += 1
    ws.getCell(row, 1).value = key
    ws.getCell(row, 2).value = value
  }
  if (board.settings.budgetEnabled) addBudgetLines(ws, board, t, row + 2)
}

function addBudgetLines(ws: ExcelJS.Worksheet, board: MilestoneBoardDto, t: Translations, start: number): void {
  const header = [t.msBudgetLine, t.msBudgetPlanned, t.msBudgetActual, t.msBudgetVariance]
  header.forEach((h, i) => {
    const cell = ws.getCell(start, i + 1)
    cell.value = h
    cell.font = { bold: true }
  })
  const rows = board.budgetLines.map((l) => [l.name, l.plannedYen, l.actualYen, l.plannedYen !== null && l.actualYen !== null ? l.actualYen - l.plannedYen : null] as const)
  const b = board.summary.budget
  ;[...rows, [t.msBudgetTotal, b.planned, b.actual, b.variance] as const].forEach((values, r) => {
    values.forEach((v, i) => {
      const cell = ws.getCell(start + 1 + r, i + 1)
      cell.value = v
      if (i > 0) cell.numFmt = "#,##0"
    })
  })
}

function punchColumns(board: MilestoneBoardDto, t: Translations): ExcelColumn<Punch & { no: number }>[] {
  const stageName = new Map(board.stages.flatMap((s) => [[s.id, s.name], ...s.steps.map((st) => [st.id, st.name] as const)]))
  const overdue = (p: Punch) => p.status !== "done" && p.dueDate !== null && p.dueDate < board.todayKey
  return [
    { key: "no", header: t.msXlsNo, width: 6, type: "number", value: (p) => p.no },
    { key: "title", header: t.msPunchTitle, width: 36, value: (p) => excelCellText(p.title) },
    { key: "detail", header: t.msPunchDetail, width: 40, value: (p) => excelCellText(p.detail) },
    { key: "stage", header: t.msXlsStage, width: 18, value: (p) => (p.planItemId ? (stageName.get(p.planItemId) ?? null) : null) },
    { key: "assignee", header: t.msPunchAssignee, width: 16, value: (p) => excelCellText(p.assigneeName) },
    { key: "due", header: t.msPunchDue, width: 13, type: "date", value: (p) => dayCell(p.dueDate) },
    { key: "status", header: t.msStatus, width: 11, value: (p) => (overdue(p) ? `${punchStatusLabel(p.status, t)} (${t.msPunchOverdue})` : punchStatusLabel(p.status, t)) },
    { key: "closed", header: t.msXlsClosedAt, width: 13, type: "date", value: (p) => excelDate(p.closedAt) },
    { key: "photos", header: t.msXlsPhotoCount, width: 7, type: "number", value: (p) => p.photos.length },
    { key: "by", header: t.msXlsCreatedBy, width: 14, value: (p) => excelCellText(p.createdByName) },
  ]
}

function docColumns(t: Translations): ExcelColumn<Doc & { no: number }>[] {
  return [
    { key: "no", header: t.msXlsNo, width: 6, type: "number", value: (d) => d.no },
    { key: "name", header: t.msDocName, width: 36, value: (d) => excelCellText(d.name) },
    { key: "status", header: t.msStatus, width: 12, value: (d) => (d.status === "received" ? t.msDocReceived : t.msDocPending) },
    { key: "at", header: t.msXlsReceivedAt, width: 13, type: "date", value: (d) => excelDate(d.receivedAt) },
    { key: "by", header: t.msXlsReceivedBy, width: 16, value: (d) => excelCellText(d.receivedByName) },
    { key: "files", header: t.msXlsFileCount, width: 8, type: "number", value: (d) => d.files.length },
    { key: "note", header: t.msCheckNote, width: 30, value: (d) => excelCellText(d.note) },
    { key: "confirm", header: t.msXlsConfirm, width: 12, value: () => null },
  ]
}

function addTrendSheet(wb: ExcelJS.Workbook, board: MilestoneBoardDto, t: Translations): void {
  const months = [...new Set(board.metrics.flatMap((m) => m.points.map((p) => p.month)))].sort()
  const cols: ExcelColumn<string>[] = [
    { key: "month", header: t.msMonth, width: 10, value: (m) => m },
    ...board.metrics.map((metric, i) => ({
      key: `m${i}`,
      header: metric.unit ? `${metric.name} (${metric.unit})` : metric.name,
      width: 18,
      type: "number" as const,
      value: (m: string) => metric.points.find((p) => p.month === m)?.value ?? null,
    })),
  ]
  addTableSheet(wb, t.msXlsTrendSheet, cols, months).pageSetup = LANDSCAPE(A4_PAPER)
}

interface ExportMeta {
  projectName: string
  created: Date
}

export function buildMilestoneWorkbook(board: MilestoneBoardDto, lang: Language, meta: ExportMeta): ExcelJS.Workbook {
  const t = getTranslations(lang)
  const wb = new ExcelJS.Workbook()
  wb.creator = "Kanflow"
  addSummarySheet(wb, board, t, lang, meta)
  addCheckSheet(wb, board, t, meta.projectName)
  const punch = board.punchItems.toReversed().map((p, i) => ({ ...p, no: i + 1 }))
  addTableSheet(wb, t.msXlsPunchSheet, punchColumns(board, t), punch, { xSplit: 2 }).pageSetup = LANDSCAPE(A3_PAPER)
  const docs = addTableSheet(wb, t.msXlsDocsSheet, docColumns(t), board.documents.map((d, i) => ({ ...d, no: i + 1 })))
  docs.pageSetup = LANDSCAPE(A4_PAPER)
  if (board.metrics.length > 0) addTrendSheet(wb, board, t)
  return wb
}

export async function exportMilestoneBoard(projectId: string, lang: Language, now: Date = new Date()): Promise<{ buffer: Buffer; fileName: string }> {
  const [project, board] = await Promise.all([findExportProject(defaultDb, projectId), getBoard(projectId, now)])
  const wb = buildMilestoneWorkbook(board, lang, { projectName: project.name, created: now })
  return { buffer: await workbookBuffer(wb), fileName: excelFileName("milestones", project.name, now) }
}
