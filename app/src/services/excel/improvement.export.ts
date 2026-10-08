/**
 * GET /improvements/export: the 改善成果ボード as an .xlsx — a summary sheet
 * (one row per improvement plus totals, for management reporting) followed by
 * one A3-landscape QC-story sheet per improvement (improvement.qc-sheet.ts).
 */
import ExcelJS from "exceljs"
import { getTranslations, type Language, type Translations } from "@/lib/i18n"
import { KAIZEN_STAGES } from "@/lib/improvement/constants"
import { categoryLabel, stageLabel } from "@/lib/improvement/labels"
import { achievementRate, summarizeImprovements } from "@/lib/improvement/metrics"
import { defaultDb } from "@/services/_shared/db"
import { findBoardItems } from "@/services/improvements/improvements.repository"
import { findExportProject } from "./excel.project"
import { addTableSheet, excelCellText, excelDate, excelFileName, workbookBuffer, type ExcelColumn } from "./excel.shared"
import { A3_PAPER, addQcStorySheet, type QcItem } from "./improvement.qc-sheet"

type BoardRow = Awaited<ReturnType<typeof findBoardItems>>[number]

/** Board row → export row (texts as written; the linked PBI's story is the title when present). */
export function toQcItem(row: BoardRow): QcItem {
  const pb = row.pbItem && !row.pbItem.deletedAt ? row.pbItem : null
  const title = (pb?.userStory ?? row.userStory ?? row.epic ?? row.initiative ?? "").split(/\r?\n/, 1)[0] ?? ""
  return {
    title: title || "—",
    theme: row.initiative,
    countermeasure: [pb?.userStory ?? row.userStory, row.releaseNote].filter(Boolean).join("\n\n") || null,
    assignedPo: row.assignedPo,
    kaizenStage: row.kaizenStage,
    metricCategory: row.metricCategory,
    metricName: row.metricName,
    metricUnit: row.metricUnit,
    direction: row.direction,
    baselineValue: row.baselineValue,
    targetValue: row.targetValue,
    resultValue: row.resultValue,
    annualEffectUsd: row.annualEffectUsd,
    spaceSavedM2: row.spaceSavedM2,
    manualLink: row.manualLink,
    standardizedAt: row.standardizedAt,
    releaseDate: row.releaseDate,
    rollouts: row.rollouts,
    checks: row.checks,
    photoCounts: {
      before: row.photos.filter((p) => p.phase === "before").length,
      after: row.photos.filter((p) => p.phase === "after").length,
    },
  }
}

const STAGE_ORDER = new Map<string, number>(KAIZEN_STAGES.map((s, i) => [s, i]))

/** Board order: stage, then the order loaded (oldest first). */
export function sortByStage<R extends { kaizenStage: string }>(rows: readonly R[]): R[] {
  return rows.toSorted((a, b) => (STAGE_ORDER.get(a.kaizenStage) ?? 9) - (STAGE_ORDER.get(b.kaizenStage) ?? 9))
}

function summaryColumns(t: Translations): ExcelColumn<QcItem>[] {
  const rollout = (r: QcItem) => (r.rollouts.length ? `${r.rollouts.filter((x) => x.status === "done").length}/${r.rollouts.length}` : null)
  const nextCheck = (r: QcItem) => r.checks.find((c) => !c.checkedAt)?.dueDate ?? null
  return [
    { key: "title", header: t.kzXlsTheme, width: 40, value: (r) => excelCellText([r.theme, r.title].filter(Boolean).join(" / ")) },
    { key: "stage", header: t.kzXlsStage, width: 14, value: (r) => stageLabel(r.kaizenStage, t) },
    { key: "metric", header: t.kzXlsMetric, width: 24, value: (r) => excelCellText([categoryLabel(r.metricCategory, t), r.metricName].filter(Boolean).join(" / ")) },
    { key: "unit", header: t.kzXlsUnit, width: 8, value: (r) => excelCellText(r.metricUnit) },
    { key: "before", header: t.kzBefore, width: 12, type: "number", value: (r) => r.baselineValue },
    { key: "target", header: t.kzTarget, width: 12, type: "number", value: (r) => r.targetValue },
    { key: "after", header: t.kzAfter, width: 12, type: "number", value: (r) => r.resultValue },
    { key: "rate", header: t.kzAchievement, width: 10, type: "number", value: (r) => achievementRate(r) },
    { key: "usd", header: t.kzAnnualEffect, width: 16, type: "number", value: (r) => r.annualEffectUsd },
    { key: "space", header: t.kzSpaceSaved, width: 14, type: "number", value: (r) => r.spaceSavedM2 },
    { key: "std", header: t.kzStandardizedAt, width: 14, type: "date", value: (r) => excelDate(r.standardizedAt) },
    { key: "rollout", header: t.kzXlsRollout, width: 10, value: rollout },
    { key: "check", header: t.kzNextCheck.replace("{date}", "").trim(), width: 14, type: "date", value: (r) => excelDate(nextCheck(r)) },
  ]
}

/** Summary sheet: the item table, then the totals of the board summary strip. */
function addSummarySheet(wb: ExcelJS.Workbook, items: readonly QcItem[], t: Translations): void {
  const ws = addTableSheet(wb, t.kzXlsSummarySheet, summaryColumns(t), items, { xSplit: 1 })
  ws.getColumn("rate").numFmt = "0%"
  ws.getColumn("usd").numFmt = "$#,##0"
  ws.getColumn("space").numFmt = "#,##0.00"
  ws.pageSetup = { paperSize: A3_PAPER, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  const s = summarizeImprovements(items)
  const start = items.length + 3
  const lines: Array<[string, string | number | null, string?]> = [
    [t.kzSumEffect, s.totalAnnualEffectUsd, "$#,##0"],
    [t.kzSumSpace, s.totalSpaceSavedM2, "#,##0.00"],
    [t.kzSumStandardized, s.standardizedCount],
    [t.kzSumRollout, s.rolloutCompletion, "0%"],
    ...KAIZEN_STAGES.map((stage): [string, number] => [stageLabel(stage, t), s.countByStage[stage]]),
  ]
  ws.getCell(start - 1, 1).value = t.kzXlsTotal
  ws.getCell(start - 1, 1).font = { bold: true }
  lines.forEach(([label, value, fmt], i) => {
    ws.getCell(start + i, 1).value = label
    const cell = ws.getCell(start + i, 2)
    cell.value = value
    if (fmt) cell.numFmt = fmt
  })
}

export function buildImprovementWorkbook(items: readonly QcItem[], lang: Language, meta: { projectName: string; created: Date }): ExcelJS.Workbook {
  const t = getTranslations(lang)
  const wb = new ExcelJS.Workbook()
  wb.creator = "Kanflow"
  const sorted = sortByStage(items)
  addSummarySheet(wb, sorted, t)
  sorted.forEach((item, i) => addQcStorySheet(wb, item, i, t, meta))
  return wb
}

export async function exportImprovements(projectId: string, lang: Language, now: Date = new Date()): Promise<{ buffer: Buffer; fileName: string }> {
  const [project, rows] = await Promise.all([findExportProject(defaultDb, projectId), findBoardItems(defaultDb, projectId)])
  const wb = buildImprovementWorkbook(rows.map(toQcItem), lang, { projectName: project.name, created: now })
  return { buffer: await workbookBuffer(wb), fileName: excelFileName("kaizen", project.name, now) }
}
