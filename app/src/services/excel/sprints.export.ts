/**
 * GET /sprints/export[?sprintId=]: sprints (all, or one) as an .xlsx with a
 * sprint sheet and a task sheet. Tasks of trashed PBIs and the PBI
 * placeholder rows (no task name) are left out, like every sprint view.
 */
import ExcelJS from "exceljs"
import { getTranslations, type Language, type Translations } from "@/lib/i18n"
import { getProjectTypeLabels } from "@/lib/project-type-labels"
import { isRealTask } from "@/lib/tool-helpers"
import { defaultDb, type Db } from "@/services/_shared/db"
import { NotFoundError } from "@/services/_shared/errors"
import { LIST_LIMITS } from "@/services/_shared/limits"
import { LIVE_PBI } from "@/services/_shared/soft-delete"
import { findExportProject } from "./excel.project"
import { addTableSheet, excelCellText, excelDate, excelFileName, workbookBuffer, type ExcelColumn } from "./excel.shared"

export interface SprintTaskExportRow {
  taskName: string
  status: string
  assignee: string | null
  estimatedHours: number | null
  actualHours: number | null
  completedAt: Date | null
  pbiDisplayId: number
  pbiTitle: string | null
}

export interface SprintExportRow {
  sprintName: string
  status: string
  startDate: Date
  endDate: Date
  sprintGoal: string | null
  capacity: number
  actualScore: number
  tasks: SprintTaskExportRow[]
}

type TaskRow = SprintTaskExportRow & { sprintName: string }

export function sprintStatusLabel(status: string, t: Translations): string {
  const labels: Record<string, string> = {
    planning: t.sprintStatusPlanning,
    active: t.sprintStatusActive,
    review: t.sprintStatusReview,
    done: t.sprintStatusDone,
    archived: t.sprintStatusArchived,
  }
  return labels[status] ?? status
}

export function taskStatusLabel(status: string, t: Translations): string {
  const labels: Record<string, string> = { todo: t.taskTodo, in_progress: t.taskInProgress, review: t.excelTaskStatusReview, done: t.taskDone }
  return labels[status] ?? status
}

function sprintColumns(t: Translations, goalLabel: string): ExcelColumn<SprintExportRow>[] {
  return [
    { key: "name", header: t.excelColSprintName, width: 28, value: (s) => excelCellText(s.sprintName) },
    { key: "status", header: t.excelColStatus, width: 12, value: (s) => sprintStatusLabel(s.status, t) },
    { key: "start", header: t.excelColStartDate, width: 12, type: "date", value: (s) => excelDate(s.startDate) },
    { key: "end", header: t.excelColEndDate, width: 12, type: "date", value: (s) => excelDate(s.endDate) },
    { key: "goal", header: goalLabel, width: 48, value: (s) => excelCellText(s.sprintGoal) },
    { key: "capacity", header: t.excelColCapacity, width: 12, type: "number", value: (s) => s.capacity },
    { key: "actual", header: t.excelColActualScore, width: 14, type: "number", value: (s) => s.actualScore },
    { key: "tasks", header: t.excelColTaskCount, width: 10, type: "number", value: (s) => s.tasks.length },
    { key: "done", header: t.excelColTaskDone, width: 12, type: "number", value: (s) => s.tasks.filter((x) => x.status === "done").length },
  ]
}

function taskColumns(t: Translations): ExcelColumn<TaskRow>[] {
  return [
    { key: "sprint", header: t.excelColSprint, width: 24, value: (r) => excelCellText(r.sprintName) },
    { key: "pbiId", header: t.excelColId, width: 8, type: "number", value: (r) => r.pbiDisplayId },
    { key: "pbi", header: t.excelColPbi, width: 36, value: (r) => excelCellText(r.pbiTitle) },
    { key: "task", header: t.excelColTask, width: 40, value: (r) => excelCellText(r.taskName) },
    { key: "assignee", header: t.excelColAssignee, width: 18, value: (r) => excelCellText(r.assignee) },
    { key: "status", header: t.excelColStatus, width: 12, value: (r) => taskStatusLabel(r.status, t) },
    { key: "estimate", header: t.excelColEstimate, width: 12, type: "number", value: (r) => r.estimatedHours },
    { key: "actual", header: t.excelColActualHours, width: 12, type: "number", value: (r) => r.actualHours },
    { key: "completed", header: t.excelColCompletedAt, width: 18, type: "datetime", value: (r) => excelDate(r.completedAt) },
  ]
}

export function buildSprintsWorkbook(sprints: readonly SprintExportRow[], lang: Language, sprintGoalLabel?: string): ExcelJS.Workbook {
  const t = getTranslations(lang)
  const wb = new ExcelJS.Workbook()
  wb.creator = "Kanflow"
  addTableSheet(wb, t.excelSheetSprints, sprintColumns(t, sprintGoalLabel ?? getProjectTypeLabels("software", lang).sprintGoal), sprints, { xSplit: 1 })
  const tasks = sprints.flatMap((s) => s.tasks.map((task) => ({ ...task, sprintName: s.sprintName })))
  addTableSheet(wb, t.excelSheetTasks, taskColumns(t), tasks)
  return wb
}

// === data ===

export function findSprintsForExport(db: Db, projectId: string, sprintId?: string) {
  return db.sprint.findMany({
    where: { projectId, ...(sprintId ? { id: sprintId } : {}) },
    orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
    take: LIST_LIMITS.sprints,
    select: {
      sprintName: true,
      status: true,
      startDate: true,
      endDate: true,
      sprintGoal: true,
      capacity: true,
      actualScore: true,
      items: {
        where: LIVE_PBI,
        orderBy: { createdAt: "asc" },
        select: {
          taskName: true,
          status: true,
          assignee: true,
          estimatedHours: true,
          actualHours: true,
          completedAt: true,
          assignees: { select: { user: { select: { name: true } } } },
          pbItem: { select: { displayId: true, userStory: true, initiative: true } },
        },
      },
    },
  })
}

type SprintDbRow = Awaited<ReturnType<typeof findSprintsForExport>>[number]

/** Pure: DB row → export row (real tasks only; normalized assignees win over the legacy string). */
export function toSprintExportRow(s: SprintDbRow): SprintExportRow {
  return {
    sprintName: s.sprintName,
    status: s.status,
    startDate: s.startDate,
    endDate: s.endDate,
    sprintGoal: s.sprintGoal,
    capacity: s.capacity,
    actualScore: s.actualScore,
    tasks: s.items.filter(isRealTask).map((i) => ({
      taskName: i.taskName ?? "",
      status: i.status,
      assignee: i.assignees.length > 0 ? i.assignees.map((a) => a.user.name).join(", ") : i.assignee,
      estimatedHours: i.estimatedHours,
      actualHours: i.actualHours,
      completedAt: i.completedAt,
      pbiDisplayId: i.pbItem.displayId,
      pbiTitle: i.pbItem.userStory || i.pbItem.initiative,
    })),
  }
}

export async function exportSprints(
  projectId: string,
  sprintId: string | undefined,
  lang: Language,
  now: Date = new Date()
): Promise<{ buffer: Buffer; fileName: string }> {
  const [project, raw] = await Promise.all([findExportProject(defaultDb, projectId), findSprintsForExport(defaultDb, projectId, sprintId)])
  if (sprintId && raw.length === 0) throw new NotFoundError("Sprint not found", {}, "SPRINT_NOT_FOUND")
  const goalLabel = getProjectTypeLabels(project.projectType, lang).sprintGoal
  const wb = buildSprintsWorkbook(raw.map(toSprintExportRow), lang, goalLabel)
  const name = sprintId ? `${project.name} ${raw[0].sprintName}` : project.name
  return { buffer: await workbookBuffer(wb), fileName: excelFileName(sprintId ? "sprint" : "sprints", name, now) }
}
