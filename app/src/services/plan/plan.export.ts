/**
 * GET /plan/export: the master plan as an .xlsx (exceljs). One row per live
 * item in tree order (WBS number + indented name), planned / baseline /
 * actual dates (real Excel dates), progress, status, schedule state, owner
 * and linked PBI counts. Headers and values use the page's own wording
 * (i18n plan domain) and names are shown in the export language like on screen.
 */
import ExcelJS from "exceljs"
import { getTranslations, type Translations } from "@/lib/i18n"
import { tokyoDateKey, type ScheduleState } from "@/lib/plan-progress"
import { pickText } from "@/lib/translation/pick-text"
import type { PlanItemDto } from "./plan.dto"
import * as repo from "./plan.repository"
import type { ExportLang } from "./plan.schemas"
import { listPlan } from "./plan.service"
import { defaultDb } from "@/services/_shared/db"

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

const COLUMNS = [
  "wbs",
  "name",
  "milestone",
  "owner",
  "plannedStart",
  "plannedEnd",
  "baselineStart",
  "baselineEnd",
  "varianceDays",
  "actualStart",
  "actualEnd",
  "progress",
  "status",
  "schedule",
  "mode",
  "pbis",
  "points",
] as const
type Column = (typeof COLUMNS)[number]

const DATE_COLUMNS: ReadonlySet<Column> = new Set(["plannedStart", "plannedEnd", "baselineStart", "baselineEnd", "actualStart", "actualEnd"])
const DATE_FORMAT = "yyyy-mm-dd"

interface Labels {
  sheet: string
  columns: Record<Column, string>
  status: Record<string, string>
  schedule: Record<ScheduleState, string>
  mode: Record<string, string>
  yes: string
}

/** Export wording = the screen's wording (plan i18n domain), so the sheet reads like the page. */
export function exportLabels(t: Translations): Labels {
  return {
    sheet: t.planTitle,
    columns: {
      wbs: t.planExportWbs,
      name: t.planColName,
      milestone: t.planIsMilestone,
      owner: t.planOwner,
      plannedStart: t.planPlannedStart,
      plannedEnd: t.planPlannedEnd,
      baselineStart: t.planExportBaselineStart,
      baselineEnd: t.planExportBaselineEnd,
      varianceDays: t.planExportVariance,
      actualStart: t.planActualStart,
      actualEnd: t.planActualEnd,
      progress: t.planProgressPct,
      status: t.planStatus,
      schedule: t.planExportSchedule,
      mode: t.planProgressMode,
      pbis: t.planExportPbis,
      points: t.planExportPoints,
    },
    status: { not_started: t.planStatusNotStarted, in_progress: t.planStatusInProgress, done: t.planStatusDone, on_hold: t.planStatusOnHold },
    schedule: {
      done: t.planStatusDone,
      delayed: t.planStatusDelayed,
      at_risk: t.planScheduleAtRisk,
      not_started: t.planStatusNotStarted,
      on_track: t.planScheduleOnTrack,
      on_hold: t.planStatusOnHold,
    },
    mode: { manual: t.planProgressManual, linked: t.planProgressLinked },
    yes: "◆",
  }
}

/** "YYYY-MM-DD" → a UTC-midnight Date (exceljs stores it as the matching Excel serial day). */
export function excelDate(ymd: string | null): Date | null {
  const m = ymd ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd) : null
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null
}

export interface OrderedPlanRow {
  item: PlanItemDto
  depth: number
  wbs: string
}

/** Pure: items in tree order (siblings by sortOrder) with depth and WBS number; orphans are roots. */
export function orderPlanTree(items: readonly PlanItemDto[]): OrderedPlanRow[] {
  const ids = new Set(items.map((i) => i.id))
  const children = new Map<string | null, PlanItemDto[]>()
  for (const i of items) {
    const key = i.parentId && ids.has(i.parentId) ? i.parentId : null
    children.set(key, [...(children.get(key) ?? []), i])
  }
  const out: OrderedPlanRow[] = []
  const seen = new Set<string>()
  const walk = (parent: string | null, depth: number, prefix: string) => {
    const kids = (children.get(parent) ?? []).toSorted((a, b) => a.sortOrder - b.sortOrder)
    kids.forEach((item, idx) => {
      if (seen.has(item.id)) return
      seen.add(item.id)
      const wbs = prefix ? `${prefix}.${idx + 1}` : String(idx + 1)
      out.push({ item, depth, wbs })
      walk(item.id, depth + 1, wbs)
    })
  }
  walk(null, 0, "")
  return out
}

function rowValues(r: OrderedPlanRow, l: Labels, lang: ExportLang): Record<Column, string | number | Date | null> {
  const i = r.item
  return {
    wbs: r.wbs,
    name: pickText(i.i18n, "name", i.name, lang).text,
    milestone: i.isMilestone ? l.yes : "",
    owner: i.owner?.name ?? "",
    plannedStart: excelDate(i.plannedStart),
    plannedEnd: excelDate(i.plannedEnd),
    baselineStart: excelDate(i.baselineStart),
    baselineEnd: excelDate(i.baselineEnd),
    varianceDays: i.baselineVarianceDays,
    actualStart: excelDate(i.actualStart),
    actualEnd: excelDate(i.actualEnd),
    progress: i.progressPct,
    status: l.status[i.status] ?? i.status,
    schedule: l.schedule[i.scheduleState] ?? i.scheduleState,
    mode: l.mode[i.progressMode] ?? i.progressMode,
    pbis: i.linked ? `${i.linked.pbiDone}/${i.linked.pbiCount}` : "",
    points: i.linked ? `${i.linked.pointsDone}/${i.linked.pointsTotal}` : "",
  }
}

/** Pure-ish: the workbook of the given items (no I/O). */
export function buildPlanWorkbook(items: readonly PlanItemDto[], lang: ExportLang): ExcelJS.Workbook {
  const l = exportLabels(getTranslations(lang))
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(l.sheet, { views: [{ state: "frozen", ySplit: 1, xSplit: 2 }] })
  ws.columns = COLUMNS.map((key) => ({
    header: l.columns[key],
    key,
    width: key === "name" ? 48 : key === "wbs" ? 10 : 16,
    ...(DATE_COLUMNS.has(key) && { style: { numFmt: DATE_FORMAT } }),
  }))
  ws.getRow(1).font = { bold: true }
  for (const r of orderPlanTree(items)) {
    const row = ws.addRow(rowValues(r, l, lang))
    row.getCell("name").alignment = { indent: Math.min(r.depth, 15) }
    if (r.item.hasChildren) row.font = { bold: true }
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } }
  return wb
}

const MAX_NAME_CHARS = 80
const OPENERS = "([{（［｛「『【"
const CLOSERS = ")]}）］｝」』】"

/** Cut `name` to `max` characters without leaving a bracket open or a trailing separator. */
export function truncateFileStem(name: string, max: number = MAX_NAME_CHARS): string {
  const chars = [...name]
  if (chars.length <= max) return name
  let cut = chars.slice(0, max)
  const depth: number[] = []
  cut.forEach((ch, idx) => {
    if (OPENERS.includes(ch)) depth.push(idx)
    else if (CLOSERS.includes(ch)) depth.pop()
  })
  if (depth.length > 0) cut = cut.slice(0, depth[0])
  return cut.join("").replace(/[_\-.\s]+$/u, "")
}

/** Pure: "plan-<project>-<YYYY-MM-DD>.xlsx" with characters unsafe in file names replaced (one "_" per run). */
export function exportFileName(projectName: string, today: string): string {
  const replaced = projectName.replace(/[\\/:*?"<>|\u0000-\u001f\s]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "")
  const safe = truncateFileStem(replaced) || "project"
  return `plan-${safe}-${today}.xlsx`
}

/** Content-Disposition with an ASCII fallback and the UTF-8 name (RFC 6266 / 5987). */
export function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "_")
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}

export async function exportPlan(projectId: string, lang: ExportLang, now: Date = new Date()): Promise<{ buffer: Buffer; fileName: string }> {
  const [plan, projectName] = await Promise.all([listPlan(projectId, now), repo.findProjectName(defaultDb, projectId)])
  const wb = buildPlanWorkbook(plan.items, lang)
  const buffer = Buffer.from(await wb.xlsx.writeBuffer())
  return { buffer, fileName: exportFileName(projectName ?? projectId, tokyoDateKey(now)) }
}
