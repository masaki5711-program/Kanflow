/**
 * The チェック項目 record sheet of the マイルストーン・検収ボード export
 * (検収記録 / テスト記録 …, named by the board's check 呼び名): one row per
 * check with criterion, result, 立会者 and day, then empty 立会者 / 確認者
 * signature cells to sign on paper. A4 landscape, header repeated per page.
 */
import ExcelJS from "exceljs"
import type { Translations } from "@/lib/i18n"
import type { MilestoneBoardDto } from "@/services/milestones/milestones.service"
import { excelCellText, safeSheetName } from "./excel.shared"

export const A4_PAPER = 9 as ExcelJS.PaperSize

const THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
}
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } }
/** Tall enough to sign in. */
const SIGN_ROW_HEIGHT = 36

/** "YYYY-MM-DD" → a Date Excel shows as that calendar day (exceljs writes UTC fields). */
export function dayCell(key: string | null): Date | null {
  return key ? new Date(`${key}T00:00:00.000Z`) : null
}

export function checkLabelOf(board: Pick<MilestoneBoardDto, "settings">, t: Translations): string {
  return board.settings.checkLabel?.trim() || t.msChecksDefaultLabel
}

export function resultLabel(result: string | null, t: Translations): string {
  const map: Record<string, string> = { passed: t.msResultPassed, conditional: t.msResultConditional, failed: t.msResultFailed }
  return result ? (map[result] ?? result) : t.msResultPending
}

interface Col {
  header: string
  width: number
}

function columns(t: Translations): Col[] {
  return [
    { header: t.msXlsNo, width: 5 },
    { header: t.msCheckName, width: 28 },
    { header: t.msCheckCriterion, width: 34 },
    { header: t.msXlsStage, width: 16 },
    { header: t.msStatus, width: 13 },
    { header: t.msWitness, width: 16 },
    { header: t.msCheckedAt, width: 12 },
    { header: t.msCheckNote, width: 24 },
    { header: t.msXlsSignWitness, width: 16 },
    { header: t.msXlsSignInspector, width: 16 },
  ]
}

function stageNames(board: MilestoneBoardDto): Map<string, string> {
  return new Map(board.stages.flatMap((s) => [[s.id, s.name] as const, ...s.steps.map((st) => [st.id, st.name] as const)]))
}

/** Title row, header row, one bordered row per check (signature cells left blank). */
export function addCheckSheet(wb: ExcelJS.Workbook, board: MilestoneBoardDto, t: Translations, projectName: string): ExcelJS.Worksheet {
  const label = checkLabelOf(board, t)
  const cols = columns(t)
  const ws = wb.addWorksheet(safeSheetName(t.msXlsChecksSheet.replace("{label}", label)), { views: [{ state: "frozen", ySplit: 2 }] })
  ws.columns = cols.map((c) => ({ width: c.width }))
  ws.mergeCells(1, 1, 1, cols.length)
  const title = ws.getCell(1, 1)
  title.value = `${projectName} — ${t.msXlsChecksSheet.replace("{label}", label)}${board.summary.checks.complete ? ` (${t.msAccepted})` : ""}`
  title.font = { bold: true, size: 14 }
  const header = ws.getRow(2)
  cols.forEach((c, i) => {
    const cell = header.getCell(i + 1)
    cell.value = c.header
    cell.font = { bold: true }
    cell.fill = HEADER_FILL
    cell.border = THIN
    cell.alignment = { vertical: "middle", wrapText: true }
  })
  const names = stageNames(board)
  board.checks.forEach((c, i) => {
    const row = ws.getRow(3 + i)
    const values = [
      i + 1,
      excelCellText(c.name),
      excelCellText(c.criterion),
      c.planItemId ? (names.get(c.planItemId) ?? null) : null,
      resultLabel(c.result, t),
      excelCellText(c.witness),
      dayCell(c.checkedAt),
      excelCellText(c.note),
      null,
      null,
    ]
    values.forEach((v, j) => {
      const cell = row.getCell(j + 1)
      cell.value = v
      cell.border = THIN
      cell.alignment = { vertical: "top", wrapText: true }
      if (v instanceof Date) cell.numFmt = "yyyy-mm-dd"
    })
    row.height = SIGN_ROW_HEIGHT
  })
  ws.pageSetup = { paperSize: A4_PAPER, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "2:2" }
  return ws
}
