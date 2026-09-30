/**
 * "My tasks" urgency (home page). A sprint task has no due date of its own,
 * so it is due when its sprint ends. Days are counted in the viewer's local
 * calendar (the sprint end is shown as a local date too).
 */
export type Urgency = "overdue" | "due_soon" | "later" | "done"

/** Open tasks whose sprint ends within this many days (today = 0) are "due soon". */
export const DUE_SOON_DAYS = 3
/** "Due this week" KPI window: today + the next 6 days. */
export const DUE_WEEK_DAYS = 6

const DAY_MS = 86_400_000
const URGENCY_RANK: Record<Urgency, number> = { overdue: 0, due_soon: 1, later: 2, done: 3 }
const STATUS_RANK: Record<string, number> = { in_progress: 0, review: 1, todo: 2 }

export interface UrgencyTask {
  id: string
  status: string
  sprintEndDate: string
  projectId: string
}

function localDayNumber(d: Date): number {
  return Math.round(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / DAY_MS)
}

/** Calendar days from today to `iso` (negative = past), or null when unparsable. */
export function daysUntil(iso: string, now: Date): number | null {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return localDayNumber(d) - localDayNumber(now)
}

export function urgencyOf(task: Pick<UrgencyTask, "status" | "sprintEndDate">, now: Date): Urgency {
  if (task.status === "done") return "done"
  const days = daysUntil(task.sprintEndDate, now)
  if (days === null) return "later"
  if (days < 0) return "overdue"
  return days <= DUE_SOON_DAYS ? "due_soon" : "later"
}

export interface MyTaskSummary {
  open: number
  overdue: number
  dueThisWeek: number
}

export function summarizeMyTasks(tasks: readonly Pick<UrgencyTask, "status" | "sprintEndDate">[], now: Date): MyTaskSummary {
  const open = tasks.filter((t) => t.status !== "done")
  const days = open.map((t) => daysUntil(t.sprintEndDate, now))
  return {
    open: open.length,
    overdue: days.filter((d) => d !== null && d < 0).length,
    dueThisWeek: days.filter((d) => d !== null && d >= 0 && d <= DUE_WEEK_DAYS).length,
  }
}

export interface ProjectTaskGroup<T extends UrgencyTask> {
  projectId: string
  tasks: T[]
}

function dueTime(t: UrgencyTask): number {
  const ms = new Date(t.sprintEndDate).getTime()
  return isNaN(ms) ? Number.MAX_SAFE_INTEGER : ms
}

function compareTasks(now: Date) {
  return (a: UrgencyTask, b: UrgencyTask) =>
    URGENCY_RANK[urgencyOf(a, now)] - URGENCY_RANK[urgencyOf(b, now)] ||
    dueTime(a) - dueTime(b) ||
    (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9)
}

/** Group by project; tasks and projects both ordered most urgent first (stable otherwise). */
export function groupByProject<T extends UrgencyTask>(tasks: readonly T[], now: Date): ProjectTaskGroup<T>[] {
  const order: string[] = []
  const byProject = new Map<string, T[]>()
  for (const task of tasks) {
    if (!byProject.has(task.projectId)) order.push(task.projectId)
    byProject.set(task.projectId, [...(byProject.get(task.projectId) ?? []), task])
  }
  const cmp = compareTasks(now)
  const groups = order.map((projectId) => ({ projectId, tasks: [...(byProject.get(projectId) ?? [])].sort(cmp) }))
  return groups
    .map((g, index) => ({ g, index }))
    .sort((a, b) => cmp(a.g.tasks[0], b.g.tasks[0]) || a.index - b.index)
    .map(({ g }) => g)
}
