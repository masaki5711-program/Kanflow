/**
 * GET /backlog/export: the project's live PBIs as an .xlsx, in backlog order
 * (Ready, Not ready, Completed; each by sortOrder). When the backlog holds
 * translated text, every translated field also gets a Japanese and an
 * Indonesian column next to the original.
 */
import ExcelJS from "exceljs"
import { getTranslations, type Language, type Translations } from "@/lib/i18n"
import { getProjectTypeLabels, type ProjectType, type ProjectTypeLabels } from "@/lib/project-type-labels"
import type { EntityI18n } from "@/lib/translation/types"
import { defaultDb, type Db } from "@/services/_shared/db"
import { LIST_LIMITS } from "@/services/_shared/limits"
import { notDeleted } from "@/services/_shared/soft-delete"
import { getI18nFor } from "@/services/_shared/translations"
import {
  BACKLOG_FIELDS,
  BILINGUAL_FIELDS,
  backlogHeader,
  statusLabel,
  type BacklogField,
  type BilingualField,
} from "./backlog.columns"
import { findExportProject } from "./excel.project"
import { addTableSheet, excelCellText, excelDate, excelFileName, workbookBuffer, type ExcelCell, type ExcelColumn } from "./excel.shared"

export interface BacklogExportRow {
  id: string
  displayId: number
  initiative: string | null
  epic: string | null
  userStory: string | null
  acceptanceCriteria: string | null
  referenceDoc: string | null
  workloadScore: number
  status: string
  assignedPo: string | null
  poNote: string | null
  notReadyReason: string | null
  goal: string | null
  planItem: string | null
  sprints: string[]
  createdAt: Date
  updatedAt: Date
  i18n: EntityI18n
}

export interface BacklogWorkbookOptions {
  lang: Language
  projectType: ProjectType
  /** Add JA / ID columns for the translated fields. */
  bilingual: boolean
}

const STATUS_ORDER: Record<string, number> = { ready: 0, not_ready: 1, completed: 2 }

const WIDTHS: Record<BacklogField, number> = {
  displayId: 8, initiative: 24, epic: 24, userStory: 48, acceptanceCriteria: 48, status: 12, workloadScore: 10,
  goal: 28, assignedPo: 16, poNote: 32, notReadyReason: 32, referenceDoc: 32, planItem: 28, sprint: 24,
  createdAt: 18, updatedAt: 18,
}

/** Pure: does any exported PBI carry a field translated into both languages? */
export function hasBilingualText(i18nById: ReadonlyMap<string, EntityI18n>): boolean {
  for (const entry of i18nById.values()) {
    for (const f of BILINGUAL_FIELDS) {
      const tr = entry[f]
      if (tr?.ja?.trim() && tr?.id?.trim()) return true
    }
  }
  return false
}

function fieldValue(field: BacklogField, r: BacklogExportRow, t: Translations): ExcelCell {
  switch (field) {
    case "displayId": return r.displayId
    case "status": return statusLabel(r.status, t)
    case "workloadScore": return r.workloadScore
    case "goal": return excelCellText(r.goal)
    case "planItem": return excelCellText(r.planItem)
    case "sprint": return excelCellText(r.sprints.join(", "))
    case "createdAt": return excelDate(r.createdAt)
    case "updatedAt": return excelDate(r.updatedAt)
    default: return excelCellText(r[field])
  }
}

function sideColumns(field: BilingualField, header: string, t: Translations): ExcelColumn<BacklogExportRow>[] {
  return (["ja", "id"] as const).map((side) => ({
    key: `${field}_${side}`,
    header: (side === "ja" ? t.excelColLangJa : t.excelColLangId).replace("{label}", header),
    width: WIDTHS[field],
    value: (r: BacklogExportRow) => excelCellText(r.i18n[field]?.[side] ?? null),
  }))
}

/** Pure: the column list for a language / project type (bilingual adds JA/ID columns after each translated field). */
export function backlogColumns(t: Translations, pt: ProjectTypeLabels, bilingual: boolean): ExcelColumn<BacklogExportRow>[] {
  return BACKLOG_FIELDS.flatMap((field) => {
    const header = backlogHeader(field, t, pt)
    const main: ExcelColumn<BacklogExportRow> = {
      key: field,
      header,
      width: WIDTHS[field],
      type: field === "createdAt" || field === "updatedAt" ? "datetime" : field === "displayId" || field === "workloadScore" ? "number" : "text",
      value: (r) => fieldValue(field, r, t),
    }
    const extra = bilingual && (BILINGUAL_FIELDS as readonly string[]).includes(field) ? sideColumns(field as BilingualField, header, t) : []
    return [main, ...extra]
  })
}

/** Pure: backlog order (status group, then sortOrder as loaded). */
export function sortForExport<R extends { status: string }>(rows: readonly R[]): R[] {
  return rows
    .map((r, i) => ({ r, i }))
    .toSorted((a, b) => (STATUS_ORDER[a.r.status] ?? 9) - (STATUS_ORDER[b.r.status] ?? 9) || a.i - b.i)
    .map((x) => x.r)
}

export function buildBacklogWorkbook(rows: readonly BacklogExportRow[], opts: BacklogWorkbookOptions): ExcelJS.Workbook {
  const t = getTranslations(opts.lang)
  const pt = getProjectTypeLabels(opts.projectType, opts.lang)
  const wb = new ExcelJS.Workbook()
  wb.creator = "Kanflow"
  addTableSheet(wb, t.excelSheetBacklog, backlogColumns(t, pt, opts.bilingual), sortForExport(rows), { xSplit: 1 })
  return wb
}

// === data ===

export function findBacklogForExport(db: Db, projectId: string) {
  return db.productBacklogItem.findMany({
    where: notDeleted({ projectId }),
    select: {
      id: true,
      displayId: true,
      initiative: true,
      epic: true,
      userStory: true,
      acceptanceCriteria: true,
      referenceDoc: true,
      workloadScore: true,
      status: true,
      assignedPo: true,
      poNote: true,
      notReadyReason: true,
      createdAt: true,
      updatedAt: true,
      productGoal: { select: { title: true } },
      planItem: { select: { name: true, deletedAt: true } },
      sprintItems: { select: { sprint: { select: { id: true, sprintName: true, startDate: true } } } },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    take: LIST_LIMITS.backlogItems,
  })
}

type ExportDbRow = Awaited<ReturnType<typeof findBacklogForExport>>[number]

/** Distinct sprint names of the PBI's task rows, oldest sprint first. */
function sprintNames(r: ExportDbRow): string[] {
  const byId = new Map(r.sprintItems.map((si) => [si.sprint.id, si.sprint]))
  return [...byId.values()].toSorted((a, b) => a.startDate.getTime() - b.startDate.getTime()).map((s) => s.sprintName)
}

export function toExportRow(r: ExportDbRow, i18n: EntityI18n): BacklogExportRow {
  return {
    id: r.id,
    displayId: r.displayId,
    initiative: r.initiative,
    epic: r.epic,
    userStory: r.userStory,
    acceptanceCriteria: r.acceptanceCriteria,
    referenceDoc: r.referenceDoc,
    workloadScore: r.workloadScore,
    status: r.status,
    assignedPo: r.assignedPo,
    poNote: r.poNote,
    notReadyReason: r.notReadyReason,
    goal: r.productGoal?.title ?? null,
    planItem: r.planItem && r.planItem.deletedAt === null ? r.planItem.name : null,
    sprints: sprintNames(r),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    i18n,
  }
}

export async function exportBacklog(projectId: string, lang: Language, now: Date = new Date()): Promise<{ buffer: Buffer; fileName: string }> {
  const [project, raw] = await Promise.all([findExportProject(defaultDb, projectId), findBacklogForExport(defaultDb, projectId)])
  const i18n = await getI18nFor("backlog_item", raw.map((r) => r.id))
  const rows = raw.map((r) => toExportRow(r, i18n.get(r.id) ?? {}))
  const wb = buildBacklogWorkbook(rows, { lang, projectType: project.projectType, bilingual: hasBilingualText(i18n) })
  return { buffer: await workbookBuffer(wb), fileName: excelFileName("backlog", project.name, now) }
}
