/**
 * GET /backlog/import/template: an empty import workbook — the backlog sheet
 * (import columns in the viewer's language and project wording, one example
 * row) and an instructions sheet.
 */
import ExcelJS from "exceljs"
import { getTranslations, type Language } from "@/lib/i18n"
import { getProjectTypeLabels, type ProjectType } from "@/lib/project-type-labels"
import { defaultDb } from "@/services/_shared/db"
import { IMPORT_FIELDS, backlogHeader, statusLabel, type ImportField } from "./backlog.columns"
import { findExportProject } from "./excel.project"
import { IMPORT_MAX_BYTES, IMPORT_MAX_ROWS } from "./backlog.import"
import { addTableSheet, excelFileName, workbookBuffer, type ExcelCell, type ExcelColumn } from "./excel.shared"

type Example = Partial<Record<ImportField, ExcelCell>>

const WIDTHS: Record<ImportField, number> = {
  displayId: 8, initiative: 24, epic: 24, userStory: 48, acceptanceCriteria: 48, status: 12, workloadScore: 10,
  goal: 28, assignedPo: 16, poNote: 32, notReadyReason: 32, referenceDoc: 32,
}

export function buildImportTemplate(lang: Language, projectType: ProjectType): ExcelJS.Workbook {
  const t = getTranslations(lang)
  const pt = getProjectTypeLabels(projectType, lang)
  const wb = new ExcelJS.Workbook()
  wb.creator = "Kanflow"
  const columns: ExcelColumn<Example>[] = IMPORT_FIELDS.map((field) => ({
    key: field,
    header: backlogHeader(field, t, pt),
    width: WIDTHS[field],
    type: field === "displayId" || field === "workloadScore" ? "number" : "text",
    value: (r) => r[field] ?? null,
  }))
  const example: Example = {
    initiative: t.excelTplExampleInitiative,
    epic: t.excelTplExampleEpic,
    userStory: t.excelTplExampleStory,
    acceptanceCriteria: t.excelTplExampleAc,
    status: statusLabel("not_ready", t),
    workloadScore: 3,
  }
  addTableSheet(wb, t.excelSheetBacklog, columns, [example])

  const size = String(IMPORT_MAX_BYTES / (1024 * 1024))
  const rules = [
    t.excelTplIntro,
    t.excelTplRuleId,
    t.excelTplRuleEmpty,
    t.excelTplRuleColumns,
    t.excelTplRuleStatus,
    t.excelTplRulePoints,
    t.excelTplRuleGoal,
    t.excelTplRuleLimits.replace("{max}", String(IMPORT_MAX_ROWS)).replace("{size}", size),
  ]
  const help = wb.addWorksheet(t.excelSheetInstructions)
  help.getColumn(1).width = 110
  help.getCell("A1").value = t.excelImportTitle
  help.getCell("A1").font = { bold: true, size: 14 }
  rules.forEach((text, i) => {
    const cell = help.getCell(`A${i + 3}`)
    cell.value = `${i === 0 ? "" : "• "}${text}`
    cell.alignment = { wrapText: true, vertical: "top" }
  })
  return wb
}

export async function importTemplate(projectId: string, lang: Language, now: Date = new Date()): Promise<{ buffer: Buffer; fileName: string }> {
  const project = await findExportProject(defaultDb, projectId)
  const wb = buildImportTemplate(lang, project.projectType)
  return { buffer: await workbookBuffer(wb), fileName: excelFileName("backlog-template", project.name, now) }
}
