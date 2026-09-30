/**
 * GET /plan/export: the master plan as an .xlsx (exceljs). One row per live
 * item in tree order (WBS number + indented name), planned / baseline /
 * actual dates, progress, status, schedule state, owner and linked PBI counts.
 */
import ExcelJS from "exceljs"
import { tokyoDateKey, type ScheduleState } from "@/lib/plan-progress"
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

interface Labels {
  sheet: string
  columns: Record<Column, string>
  status: Record<string, string>
  schedule: Record<ScheduleState, string>
  mode: Record<string, string>
  yes: string
}

const LABELS: Record<ExportLang, Labels> = {
  ja: {
    sheet: "全体計画",
    columns: {
      wbs: "WBS", name: "項目", milestone: "マイルストーン", owner: "担当者", plannedStart: "計画開始", plannedEnd: "計画終了",
      baselineStart: "ベースライン開始", baselineEnd: "ベースライン終了", varianceDays: "差異（日）", actualStart: "実績開始",
      actualEnd: "実績終了", progress: "進捗（%）", status: "ステータス", schedule: "スケジュール", mode: "進捗の算出",
      pbis: "PBI（完了/全体）", points: "ポイント（完了/全体）",
    },
    status: { not_started: "未着手", in_progress: "進行中", done: "完了", on_hold: "保留" },
    schedule: { done: "完了", delayed: "遅延", at_risk: "要注意", not_started: "未着手", on_track: "順調", on_hold: "保留" },
    mode: { manual: "手動", linked: "PBI 連動" },
    yes: "◆",
  },
  en: {
    sheet: "Master plan",
    columns: {
      wbs: "WBS", name: "Item", milestone: "Milestone", owner: "Owner", plannedStart: "Planned start", plannedEnd: "Planned end",
      baselineStart: "Baseline start", baselineEnd: "Baseline end", varianceDays: "Variance (days)", actualStart: "Actual start",
      actualEnd: "Actual end", progress: "Progress (%)", status: "Status", schedule: "Schedule", mode: "Progress source",
      pbis: "PBIs (done/total)", points: "Points (done/total)",
    },
    status: { not_started: "Not started", in_progress: "In progress", done: "Done", on_hold: "On hold" },
    schedule: { done: "Done", delayed: "Delayed", at_risk: "At risk", not_started: "Not started", on_track: "On track", on_hold: "On hold" },
    mode: { manual: "Manual", linked: "Linked PBIs" },
    yes: "◆",
  },
  id: {
    sheet: "Rencana induk",
    columns: {
      wbs: "WBS", name: "Item", milestone: "Milestone", owner: "Penanggung jawab", plannedStart: "Rencana mulai", plannedEnd: "Rencana selesai",
      baselineStart: "Baseline mulai", baselineEnd: "Baseline selesai", varianceDays: "Selisih (hari)", actualStart: "Aktual mulai",
      actualEnd: "Aktual selesai", progress: "Progres (%)", status: "Status", schedule: "Jadwal", mode: "Sumber progres",
      pbis: "PBI (selesai/total)", points: "Poin (selesai/total)",
    },
    status: { not_started: "Belum mulai", in_progress: "Berjalan", done: "Selesai", on_hold: "Ditunda" },
    schedule: { done: "Selesai", delayed: "Terlambat", at_risk: "Berisiko", not_started: "Belum mulai", on_track: "Sesuai jadwal", on_hold: "Ditunda" },
    mode: { manual: "Manual", linked: "PBI tertaut" },
    yes: "◆",
  },
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

function rowValues(r: OrderedPlanRow, l: Labels): Record<Column, string | number | null> {
  const i = r.item
  return {
    wbs: r.wbs,
    name: i.name,
    milestone: i.isMilestone ? l.yes : "",
    owner: i.owner?.name ?? "",
    plannedStart: i.plannedStart,
    plannedEnd: i.plannedEnd,
    baselineStart: i.baselineStart ?? "",
    baselineEnd: i.baselineEnd ?? "",
    varianceDays: i.baselineVarianceDays,
    actualStart: i.actualStart ?? "",
    actualEnd: i.actualEnd ?? "",
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
  const l = LABELS[lang]
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(l.sheet, { views: [{ state: "frozen", ySplit: 1, xSplit: 2 }] })
  ws.columns = COLUMNS.map((key) => ({ header: l.columns[key], key, width: key === "name" ? 48 : key === "wbs" ? 10 : 16 }))
  ws.getRow(1).font = { bold: true }
  for (const r of orderPlanTree(items)) {
    const row = ws.addRow(rowValues(r, l))
    row.getCell("name").alignment = { indent: Math.min(r.depth, 15) }
    if (r.item.hasChildren) row.font = { bold: true }
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } }
  return wb
}

/** Pure: "plan-<project>-<YYYY-MM-DD>.xlsx" with characters unsafe in file names replaced. */
export function exportFileName(projectName: string, today: string): string {
  const safe = projectName.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").replace(/\s+/g, "_").slice(0, 80) || "project"
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
