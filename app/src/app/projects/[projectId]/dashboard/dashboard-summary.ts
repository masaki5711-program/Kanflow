/**
 * Pure helpers of the dashboard's top row: sprint time left, the burndown
 * sparkline and the "coming up" list (plan items + sprint end).
 */

const DAY_MS = 86_400_000

/** Upcoming items are listed up to this many days ahead. */
export const DUE_HORIZON_DAYS = 14
/** At most this many "coming up" rows. */
export const DUE_MAX_ITEMS = 6

function utcDay(d: Date): number {
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / DAY_MS)
}

function localDay(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS)
}

/**
 * Calendar days from today to a stored date. Dates are stored as UTC midnight
 * (and shown via formatDateLocal in UTC), so the target is read in UTC and
 * "today" in the viewer's zone. Null when unparsable.
 */
export function daysFromToday(iso: string, now: Date): number | null {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return utcDay(d) - localDay(now)
}

export type SprintTimeline = { kind: "left"; days: number } | { kind: "today" } | { kind: "overdue"; days: number }

export function sprintTimeline(endIso: string, now: Date): SprintTimeline | null {
  const days = daysFromToday(endIso, now)
  if (days === null) return null
  if (days > 0) return { kind: "left", days }
  if (days === 0) return { kind: "today" }
  return { kind: "overdue", days: -days }
}

export interface Sparkline {
  ideal: number[]
  actual: (number | null)[]
  total: number
  remaining: number
}

interface BurndownLike {
  totalTasks: number
  idealLine: number[]
  actualLine: (number | null)[]
  actualBaseline: number | null
}

/** Sparkline series from a one-sprint burndown (the baseline fills the gap before the first burn). */
export function sparklineOf(b: BurndownLike): Sparkline {
  const firstIdx = b.actualLine.findIndex((v) => v !== null)
  const actual = b.actualLine.map((v, i) => (i === 0 && v === null && firstIdx !== 0 ? b.totalTasks : v))
  const last = [...b.actualLine].reverse().find((v): v is number => v !== null)
  return { ideal: b.idealLine, actual, total: b.totalTasks, remaining: last ?? b.totalTasks }
}

export type DueKind = "sprint_end" | "milestone" | "plan_item"

export interface DueItem {
  id: string
  kind: DueKind
  name: string
  /** ISO date the item is due. */
  date: string
  /** Days from today (negative = overdue). */
  days: number
}

export interface DuePlanItem {
  id: string
  name: string
  plannedEnd: string
  status: string
  isMilestone: boolean
}

export interface DueSprint {
  id: string
  name: string
  endDate: string
}

/**
 * Open plan items (not done) due within the horizon — overdue ones included —
 * plus the active sprint's end, soonest first, capped at DUE_MAX_ITEMS.
 */
export function buildUpcomingDue(planItems: readonly DuePlanItem[], sprint: DueSprint | null, now: Date): DueItem[] {
  const fromPlan = planItems
    .filter((p) => p.status !== "done")
    .map((p) => ({ id: p.id, kind: (p.isMilestone ? "milestone" : "plan_item") as DueKind, name: p.name, date: p.plannedEnd, days: daysFromToday(p.plannedEnd, now) }))
  const fromSprint = sprint ? [{ id: sprint.id, kind: "sprint_end" as DueKind, name: sprint.name, date: sprint.endDate, days: daysFromToday(sprint.endDate, now) }] : []
  return [...fromSprint, ...fromPlan]
    .filter((i): i is DueItem => i.days !== null && i.days <= DUE_HORIZON_DAYS)
    .sort((a, b) => a.days - b.days)
    .slice(0, DUE_MAX_ITEMS)
}

export interface SprintTaskCounts {
  todo: number
  inProgress: number
  done: number
}

/**
 * Task counts of the active sprint. PBI membership placeholder rows (no task
 * name) are not tasks — the same definition as the sprint board and burndown.
 */
export function countSprintTasks(items: readonly { taskName: string | null; status: string }[]): SprintTaskCounts {
  const real = items.filter((i) => (i.taskName ?? "").trim().length > 0)
  const done = real.filter((i) => i.status === "done").length
  const inProgress = real.filter((i) => i.status === "in_progress").length
  return { todo: real.length - done - inProgress, inProgress, done }
}
