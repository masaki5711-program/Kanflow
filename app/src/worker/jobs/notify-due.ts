/**
 * Daily due-date notifications (worker job).
 *
 * Sources (only live projects: status "active", not in the trash):
 * - sprint tasks of ACTIVE sprints, not done: due = the sprint's endDate
 *   (tasks have no own due date) → the task's assignees
 *   (TaskAssignee rows when present, else the legacy assignee name resolved
 *   against the project's members)
 * - plan items not done and not in the trash: due = plannedEnd → the project's PO / SM
 *   (read from STORED columns, so every live project with plan items is
 *   healed first — src/services/plan/plan.heal.ts — otherwise a project
 *   nobody opened since the plan_linkage migration would be notified with
 *   stale parent roll-ups; a failed heal is logged and that project skipped)
 *
 * due_soon: due date (local calendar day) within today .. today + soonDays.
 * overdue:  due date before today, at most OVERDUE_LOOKBACK_DAYS back (so a
 *           first run does not flood users with years-old items).
 *
 * Idempotent: dedupeKey `${type}:${entityId}:${yyyy-mm-dd of due date}` →
 * each item is notified once per type and due date, however often the job
 * runs (moving the due date re-arms it).
 */
import { resolveAssignees, type AssigneeCandidate } from "@/lib/assignees"
import { logger } from "@/lib/logger"
import { defaultDb, type Db } from "@/services/_shared/db"
import { notify, type NotificationType } from "@/services/_shared/notifications"
import { NOT_DELETED } from "@/services/_shared/soft-delete"
import { healProjectPlan } from "@/services/plan/plan.heal"
import { DEFAULT_NOTIFY_DUE_SOON_DAYS } from "../config"

export { DEFAULT_NOTIFY_DUE_SOON_DAYS }
export const OVERDUE_LOOKBACK_DAYS = 14
/** Upper bound of rows per source per run. */
const MAX_ROWS = 5000
const PO_SM = ["po", "sm"] as const

const log = logger.child({ module: "notify-due" })

export interface NotifyDueOptions {
  soonDays?: number
  now?: () => Date
  db?: Db
  signal?: AbortSignal
}

export interface PlanHealSummary {
  /** Live projects with live plan items that were visited. */
  projects: number
  /** Plan rows whose derived values were rewritten. */
  updated: number
  /** Projects skipped because their plan hit LIST_LIMITS.planItems. */
  capped: number
  /** Projects whose heal failed (or 1 when listing the projects failed). */
  failed: number
}

export interface NotifyDueResult {
  status: "done" | "aborted"
  candidates: { tasks: number; planItems: number }
  notified: number
  planHeal: PlanHealSummary
}

/** Local calendar day "YYYY-MM-DD". */
export function localDateKey(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${mm}-${dd}`
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days)
}

export interface DueWindow {
  /** Local midnight of today. */
  today: Date
  /** Exclusive end of the due_soon window (local midnight after today + soonDays). */
  soonEnd: Date
  /** Inclusive start of the overdue window. */
  overdueStart: Date
}

export function dueWindow(now: Date, soonDays: number): DueWindow {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return { today, soonEnd: addDays(today, soonDays + 1), overdueStart: addDays(today, -OVERDUE_LOOKBACK_DAYS) }
}

/** Pure: due_soon / overdue / null for a due date in the window. */
export function classifyDue(due: Date, w: DueWindow): NotificationType | null {
  const t = due.getTime()
  if (t >= w.today.getTime() && t < w.soonEnd.getTime()) return "due_soon"
  if (t < w.today.getTime() && t >= w.overdueStart.getTime()) return "overdue"
  return null
}

export function dueDedupeKey(type: NotificationType, entityId: string, due: Date): string {
  return `${type}:${entityId}:${localDateKey(due)}`
}

const LIVE_PROJECT_WHERE = { status: "active", ...NOT_DELETED }

function findDueTasks(db: Db, w: DueWindow) {
  return db.sprintBacklogItem.findMany({
    where: {
      status: { not: "done" },
      taskName: { not: null },
      pbItem: NOT_DELETED,
      sprint: { status: "active", endDate: { gte: w.overdueStart, lt: w.soonEnd }, project: LIVE_PROJECT_WHERE },
    },
    select: {
      id: true,
      taskName: true,
      assignee: true,
      assignees: { select: { userId: true } },
      sprint: { select: { id: true, sprintName: true, endDate: true, projectId: true } },
    },
    take: MAX_ROWS,
  })
}

function findDuePlanItems(db: Db, w: DueWindow) {
  return db.planItem.findMany({
    where: { status: { not: "done" }, ...NOT_DELETED, plannedEnd: { gte: w.overdueStart, lt: w.soonEnd }, project: LIVE_PROJECT_WHERE },
    select: { id: true, name: true, plannedEnd: true, projectId: true },
    take: MAX_ROWS,
  })
}

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err))

/**
 * Heal the stored plan roll-ups of every live project that has live plan
 * items (one project at a time; each heal is bounded by LIST_LIMITS.planItems
 * and skips a capped tree). Failures are logged and skipped, never thrown.
 */
async function healLivePlans(db: Db, signal: AbortSignal | undefined): Promise<PlanHealSummary> {
  const sum: PlanHealSummary = { projects: 0, updated: 0, capped: 0, failed: 0 }
  let projects: Array<{ id: string }>
  try {
    projects = await db.project.findMany({
      where: { ...LIVE_PROJECT_WHERE, planItems: { some: NOT_DELETED } },
      select: { id: true },
      take: MAX_ROWS,
    })
  } catch (err) {
    log.warn("plan heal: listing projects failed", { error: errorMessage(err) })
    return { ...sum, failed: 1 }
  }
  for (const { id } of projects) {
    if (signal?.aborted) break
    sum.projects += 1
    try {
      const r = await healProjectPlan(id, { db })
      sum.updated += r.applied ? r.updates.length : 0
      if (r.capped) sum.capped += 1
    } catch (err) {
      sum.failed += 1
      log.warn("plan heal failed; project skipped", { projectId: id, error: errorMessage(err) })
    }
  }
  if (sum.updated > 0 || sum.failed > 0) log.info("plan heal", { ...sum })
  return sum
}

/** Per-run memo of project lookups (members for name resolution, PO/SM ids). */
function projectCache(db: Db) {
  const members = new Map<string, Promise<AssigneeCandidate[]>>()
  const leads = new Map<string, Promise<string[]>>()
  return {
    members(projectId: string): Promise<AssigneeCandidate[]> {
      let p = members.get(projectId)
      if (!p) {
        p = db.projectMember
          .findMany({ where: { projectId }, select: { userId: true, user: { select: { name: true } } } })
          .then((rows) => rows.map((r) => ({ id: r.userId, name: r.user.name })))
        members.set(projectId, p)
      }
      return p
    },
    leads(projectId: string): Promise<string[]> {
      let p = leads.get(projectId)
      if (!p) {
        p = db.projectMember
          .findMany({ where: { projectId, role: { in: [...PO_SM] } }, select: { userId: true } })
          .then((rows) => rows.map((r) => r.userId))
        leads.set(projectId, p)
      }
      return p
    },
  }
}

type DueTask = Awaited<ReturnType<typeof findDueTasks>>[number]

async function taskRecipients(task: DueTask, cache: ReturnType<typeof projectCache>): Promise<string[]> {
  if (task.assignees.length > 0) return task.assignees.map((a) => a.userId)
  if (!task.assignee) return []
  return resolveAssignees(task.assignee, await cache.members(task.sprint.projectId)).userIds
}

/** Run one pass. Notification failures are absorbed by notify(); query failures reject. */
export async function runNotifyDue(opts: NotifyDueOptions = {}): Promise<NotifyDueResult> {
  const db = opts.db ?? defaultDb
  const w = dueWindow((opts.now ?? (() => new Date()))(), opts.soonDays ?? DEFAULT_NOTIFY_DUE_SOON_DAYS)
  const cache = projectCache(db)
  const noCandidates = { tasks: 0, planItems: 0 }
  if (opts.signal?.aborted) return { status: "aborted", candidates: noCandidates, notified: 0, planHeal: { projects: 0, updated: 0, capped: 0, failed: 0 } }
  const planHeal = await healLivePlans(db, opts.signal)
  if (opts.signal?.aborted) return { status: "aborted", candidates: noCandidates, notified: 0, planHeal }
  const [tasks, planItems] = await Promise.all([findDueTasks(db, w), findDuePlanItems(db, w)])
  const candidates = { tasks: tasks.length, planItems: planItems.length }
  let notified = 0

  for (const task of tasks) {
    if (opts.signal?.aborted) return { status: "aborted", candidates, notified, planHeal }
    const type = classifyDue(task.sprint.endDate, w)
    if (!type) continue
    notified += await notify(db, {
      recipientIds: await taskRecipients(task, cache),
      type,
      projectId: task.sprint.projectId,
      entityType: "sprint_task",
      entityId: task.id,
      payload: {
        entityLabel: task.taskName,
        dueDate: localDateKey(task.sprint.endDate),
        sprintId: task.sprint.id,
        sprintName: task.sprint.sprintName,
      },
      dedupeKey: dueDedupeKey(type, task.id, task.sprint.endDate),
    })
  }

  for (const item of planItems) {
    if (opts.signal?.aborted) return { status: "aborted", candidates, notified, planHeal }
    const type = classifyDue(item.plannedEnd, w)
    if (!type) continue
    notified += await notify(db, {
      recipientIds: await cache.leads(item.projectId),
      type,
      projectId: item.projectId,
      entityType: "plan_item",
      entityId: item.id,
      payload: { entityLabel: item.name, dueDate: localDateKey(item.plannedEnd) },
      dedupeKey: dueDedupeKey(type, item.id, item.plannedEnd),
    })
  }
  return { status: "done", candidates, notified, planHeal }
}
