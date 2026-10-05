/**
 * Server-side loaders of the dashboard's top row (my tasks here, plan items
 * coming up). Used by the dashboard page only.
 */
import { prisma } from "@/lib/prisma"
import { isMyTask, myTaskAssigneeWhere } from "@/lib/my-tasks"
import { planOverallProgress } from "@/lib/plan-overall-progress"
import { DUE_HORIZON_DAYS, type DuePlanItem } from "./dashboard-summary"

const DAY_MS = 86_400_000
/** Upper bound of rows read for the dashboard lists. */
const MY_TASKS_TAKE = 50
const PLAN_ITEMS_TAKE = 30
/** Same cap as the plan page / portfolio read of one project's plan. */
const PLAN_PROGRESS_TAKE = 2000

export interface MyTaskRow {
  id: string
  taskName: string | null
  status: string
  pbItem: { id: string; displayId: number; userStory: string | null }
}

/** My open tasks (not done) in this project's planning / active sprints. */
export async function loadMyProjectTasks(projectId: string, userId: string, userName: string | null | undefined): Promise<MyTaskRow[]> {
  const rows = await prisma.sprintBacklogItem.findMany({
    where: {
      ...myTaskAssigneeWhere(userId, userName),
      status: { not: "done" },
      sprint: { projectId, status: { in: ["planning", "active"] } },
      // Tasks of trashed PBIs are hidden like in every sprint view.
      pbItem: { deletedAt: null },
    },
    select: {
      id: true,
      taskName: true,
      status: true,
      assignee: true,
      assignees: { select: { userId: true } },
      pbItem: { select: { id: true, displayId: true, userStory: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    take: MY_TASKS_TAKE,
  })
  return rows
    .filter((row) => isMyTask(row, userId, userName))
    .map(({ id, taskName, status, pbItem }) => ({ id, taskName, status, pbItem }))
}

/** Open plan items ending before the horizon (overdue ones included). */
export async function loadDuePlanItems(projectId: string, now: Date): Promise<DuePlanItem[]> {
  const rows = await prisma.planItem.findMany({
    where: { projectId, deletedAt: null, status: { not: "done" }, plannedEnd: { lte: new Date(now.getTime() + (DUE_HORIZON_DAYS + 1) * DAY_MS) } },
    select: { id: true, name: true, plannedEnd: true, status: true, isMilestone: true },
    orderBy: { plannedEnd: "asc" },
    take: PLAN_ITEMS_TAKE,
  })
  // `lte` never matches NULL (日程未定 rows have no due date); the filter only narrows the type.
  return rows.flatMap((r) => (r.plannedEnd ? [{ ...r, plannedEnd: r.plannedEnd.toISOString() }] : []))
}

/** 計画進捗 of the project: the master plan rolled up like the portfolio / AI tool (A3-13). */
export async function loadPlanProgress(projectId: string): Promise<number | null> {
  const rows = await prisma.planItem.findMany({
    where: { projectId, deletedAt: null },
    select: { id: true, parentId: true, progressPct: true, status: true, plannedStart: true, plannedEnd: true, isMilestone: true },
    take: PLAN_PROGRESS_TAKE,
  })
  return planOverallProgress(rows)
}
