/**
 * GET /icebox/export: the project's live IceBox requests as an .xlsx, grouped
 * by status (the page's order), with the PBIs created from each request.
 */
import ExcelJS from "exceljs"
import { getTranslations, type Language, type Translations } from "@/lib/i18n"
import { getProjectTypeLabels, type ProjectTypeLabels } from "@/lib/project-type-labels"
import { defaultDb, type Db } from "@/services/_shared/db"
import { LIST_LIMITS } from "@/services/_shared/limits"
import { NOT_DELETED, notDeleted } from "@/services/_shared/soft-delete"
import { findExportProject } from "./excel.project"
import { addTableSheet, excelCellText, excelDate, excelFileName, workbookBuffer, type ExcelColumn } from "./excel.shared"

export interface IceboxExportRow {
  displayId: number
  request: string
  background: string | null
  status: string
  author: string
  assignedPo: string | null
  pbEpic: string | null
  rejectionReason: string | null
  freezeReason: string | null
  pbiDisplayIds: number[]
  createdAt: Date
  updatedAt: Date
}

const STATUS_ORDER: Record<string, number> = { unreviewed: 0, reviewed: 1, completed: 2, frozen: 3 }

export function iceboxStatusLabel(status: string, t: Translations): string {
  const labels: Record<string, string> = {
    unreviewed: t.iceboxStatusUnreviewed,
    reviewed: t.iceboxStatusReviewed,
    completed: t.iceboxStatusCompleted,
    frozen: t.iceboxStatusFrozen,
  }
  return labels[status] ?? status
}

function columns(t: Translations, pt: ProjectTypeLabels): ExcelColumn<IceboxExportRow>[] {
  return [
    { key: "id", header: t.excelColId, width: 8, type: "number", value: (r) => r.displayId },
    { key: "request", header: pt.iceboxRequest, width: 48, value: (r) => excelCellText(r.request) },
    { key: "background", header: pt.iceboxBackground, width: 48, value: (r) => excelCellText(r.background) },
    { key: "status", header: t.excelColStatus, width: 16, value: (r) => iceboxStatusLabel(r.status, t) },
    { key: "author", header: t.excelColAuthor, width: 16, value: (r) => excelCellText(r.author) },
    { key: "po", header: pt.rolePO, width: 16, value: (r) => excelCellText(r.assignedPo) },
    { key: "pbEpic", header: t.excelColPbEpic, width: 24, value: (r) => excelCellText(r.pbEpic) },
    { key: "rejection", header: t.excelColRejectionReason, width: 32, value: (r) => excelCellText(r.rejectionReason) },
    { key: "freeze", header: t.excelColFreezeReason, width: 32, value: (r) => excelCellText(r.freezeReason) },
    { key: "pbis", header: t.excelColLinkedPbis, width: 16, value: (r) => excelCellText(r.pbiDisplayIds.map((n) => `#${n}`).join(", ")) },
    { key: "created", header: t.excelColCreatedAt, width: 18, type: "datetime", value: (r) => excelDate(r.createdAt) },
    { key: "updated", header: t.excelColUpdatedAt, width: 18, type: "datetime", value: (r) => excelDate(r.updatedAt) },
  ]
}

/** Pure: status group order, then the order loaded (sortOrder). */
export function sortIcebox<R extends { status: string }>(rows: readonly R[]): R[] {
  return rows
    .map((r, i) => ({ r, i }))
    .toSorted((a, b) => (STATUS_ORDER[a.r.status] ?? 9) - (STATUS_ORDER[b.r.status] ?? 9) || a.i - b.i)
    .map((x) => x.r)
}

export function buildIceboxWorkbook(rows: readonly IceboxExportRow[], lang: Language, pt?: ProjectTypeLabels): ExcelJS.Workbook {
  const t = getTranslations(lang)
  const wb = new ExcelJS.Workbook()
  wb.creator = "Kanflow"
  addTableSheet(wb, t.excelSheetIcebox, columns(t, pt ?? getProjectTypeLabels("software", lang)), sortIcebox(rows), { xSplit: 1 })
  return wb
}

// === data ===

export function findIceboxForExport(db: Db, projectId: string) {
  return db.iceboxItem.findMany({
    where: notDeleted({ projectId }),
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    take: LIST_LIMITS.iceboxItems,
    select: {
      displayId: true,
      request: true,
      background: true,
      status: true,
      author: true,
      assignedPo: true,
      pbEpic: true,
      rejectionReason: true,
      freezeReason: true,
      createdAt: true,
      updatedAt: true,
      backlogItems: { where: NOT_DELETED, select: { displayId: true }, orderBy: { displayId: "asc" } },
    },
  })
}

export async function exportIcebox(projectId: string, lang: Language, now: Date = new Date()): Promise<{ buffer: Buffer; fileName: string }> {
  const [project, raw] = await Promise.all([findExportProject(defaultDb, projectId), findIceboxForExport(defaultDb, projectId)])
  const rows = raw.map(({ backlogItems, ...r }) => ({ ...r, pbiDisplayIds: backlogItems.map((b) => b.displayId) }))
  const wb = buildIceboxWorkbook(rows, lang, getProjectTypeLabels(project.projectType, lang))
  return { buffer: await workbookBuffer(wb), fileName: excelFileName("icebox", project.name, now) }
}
