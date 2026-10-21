// Pure sprint calculations shared by the sprint card and its tests.
import { dependencyOrder, waitingOn } from "@/lib/pbi-dependencies"
import { CARRY_SOURCE_STATUSES, unfinishedByPbi, withoutTakenOver } from "@/lib/sprint-carry-over"
import type { Sprint, SprintItem, SprintPbItem } from "../components/types"

/** Sprint lifecycle: planning → active → review → done (auto-archives).
 * Archived/done can go back to "active" to undo an accidental completion. */
export const NEXT_SPRINT_STATUSES: Readonly<Record<string, readonly string[]>> = {
  planning: ["active"],
  active: ["review", "done"],
  review: ["done", "active"],
  done: ["active"],
  archived: ["active"],
}

/** Status toggle order for a task: todo → in_progress → done → todo. */
export function nextTaskStatus(status: string): string {
  if (status === "todo") return "in_progress"
  if (status === "in_progress") return "done"
  return "todo"
}

/** A PBI membership placeholder row has no task name. */
export function isRealTask(item: Pick<SprintItem, "taskName">): boolean {
  return (item.taskName ?? "").trim().length > 0
}

export interface PbGroup {
  pbItem: SprintPbItem
  tasks: SprintItem[]
}

/** Group sprint rows by PBI, keeping first-seen order. */
export function groupTasksByPb(items: readonly SprintItem[]): PbGroup[] {
  const order: string[] = []
  const groups = new Map<string, PbGroup>()
  for (const item of items) {
    const id = item.pbItem.id
    const existing = groups.get(id)
    if (existing) {
      groups.set(id, { ...existing, tasks: [...existing.tasks, item] })
    } else {
      order.push(id)
      groups.set(id, { pbItem: item.pbItem, tasks: [item] })
    }
  }
  return order.map((id) => groups.get(id)!)
}

/**
 * Sprint rows in PBI dependency order: a PBI others wait for comes before them
 * (see dependencyOrder), each PBI's rows stay together, and the team's own order
 * holds wherever nothing depends on anything. Returns a new array.
 */
export function orderByPbDependency(items: readonly SprintItem[]): SprintItem[] {
  const pbis = groupTasksByPb(items).map((g) => g.pbItem)
  // Only prerequisites still open count: a finished one no longer holds anything back.
  const edges = pbis.flatMap((p) => waitingOn(p).map((r) => ({ predecessorId: r.id, successorId: p.id })))
  const rank = new Map(dependencyOrder(pbis, edges).map((p, at) => [p.id, at]))
  // Array.prototype.sort is stable: rows of one PBI keep their order.
  return [...items].sort((a, b) => (rank.get(a.pbItem.id) ?? 0) - (rank.get(b.pbItem.id) ?? 0))
}

export interface SprintMetrics {
  /** Sum of workload of distinct PBIs pulled into the sprint. */
  currentWorkload: number
  /**
   * Completed points: workload of the PBIs whose real tasks are ALL done — the
   * same rule as Sprint.actualScore (lib/sprint-score.ts), velocity, the report
   * and the portfolio, so one sprint shows one "completed points" number
   * everywhere (cycle 3: no more fractional 1.5 / 8).
   */
  completedWorkload: number
  isOver: boolean
  /** currentWorkload / capacity in % (rounded, uncapped). */
  progress: number
  /** Bar widths in % (0–100). */
  committedProgress: number
  doneProgress: number
  totalTasks: number
  doneTasks: number
  inProgressTasks: number
  todoTasks: number
}

function pct(value: number, capacity: number): number {
  return capacity > 0 ? Math.min(100, (value / capacity) * 100) : 0
}

export function computeSprintMetrics(sprint: Pick<Sprint, "items" | "capacity">): SprintMetrics {
  const perPb = new Map<string, { workload: number; total: number; done: number }>()
  for (const item of sprint.items) {
    const id = item.pbItem?.id
    if (!id) continue
    const prev = perPb.get(id) ?? { workload: item.pbItem.workloadScore ?? 0, total: 0, done: 0 }
    const real = isRealTask(item)
    perPb.set(id, {
      workload: prev.workload,
      total: prev.total + (real ? 1 : 0),
      done: prev.done + (real && item.status === "done" ? 1 : 0),
    })
  }
  const entries = Array.from(perPb.values())
  const currentWorkload = entries.reduce((sum, e) => sum + e.workload, 0)
  const completedWorkload = entries.reduce((sum, e) => (e.total > 0 && e.done === e.total ? sum + e.workload : sum), 0)

  const realItems = sprint.items.filter(isRealTask)
  const doneTasks = realItems.filter((i) => i.status === "done").length
  const inProgressTasks = realItems.filter((i) => i.status === "in_progress").length

  return {
    currentWorkload,
    completedWorkload,
    isOver: currentWorkload > sprint.capacity,
    progress: sprint.capacity > 0 ? Math.round((currentWorkload / sprint.capacity) * 100) : 0,
    committedProgress: pct(currentWorkload, sprint.capacity),
    doneProgress: pct(completedWorkload, sprint.capacity),
    totalTasks: realItems.length,
    doneTasks,
    inProgressTasks,
    todoTasks: realItems.length - doneTasks - inProgressTasks,
  }
}

/** Immutably patch one task inside the sprint list (optimistic updates). */
export function patchTask(sprints: readonly Sprint[], sprintId: string, taskId: string, patch: Partial<SprintItem>): Sprint[] {
  return sprints.map((s) =>
    s.id !== sprintId ? s : { ...s, items: s.items.map((i) => (i.id === taskId ? { ...i, ...patch } : i)) },
  )
}

/** Immutably remove one task from the sprint list (optimistic delete). */
export function removeTask(sprints: readonly Sprint[], sprintId: string, taskId: string): Sprint[] {
  return sprints.map((s) => (s.id !== sprintId ? s : { ...s, items: s.items.filter((i) => i.id !== taskId) }))
}

export interface UnfinishedWork {
  /** Real tasks that are not done. */
  tasks: number
  /** PBIs that are not complete (some real task open, or no task at all). */
  pbis: number
}

/** What a sprint completion leaves unfinished (shown in the completion dialog). */
export function unfinishedWork(items: readonly SprintItem[]): UnfinishedWork {
  const groups = groupTasksByPb(items)
  const pbis = groups.filter(({ tasks }) => {
    const real = tasks.filter(isRealTask)
    return real.length === 0 || real.some((i) => i.status !== "done")
  }).length
  const tasks = items.filter((i) => isRealTask(i) && i.status !== "done").length
  return { tasks, pbis }
}

export interface CarryCandidate {
  pbItem: SprintPbItem
  /** Real tasks of the PBI that are not done (copied into the new sprint). */
  openTasks: number
}

export interface CarryOverSource {
  sprint: Sprint
  candidates: CarryCandidate[]
}

/**
 * The newest sprint that is in review or ended and still has unfinished work,
 * with the PBIs to offer for carrying over into the next sprint (rule shared
 * with the server: lib/sprint-carry-over). Null when nothing is left over.
 */
export function carryOverSource(sprints: readonly Sprint[]): CarryOverSource | null {
  // A task some later sprint already copied has been carried over: it is neither offered again nor counted.
  const takenOver = new Set(sprints.flatMap((s) => s.items.flatMap((i) => (i.carriedFromId ? [i.carriedFromId] : []))))
  const newestFirst = sprints
    .filter((s) => CARRY_SOURCE_STATUSES.includes(s.status))
    .toSorted((a, b) => b.startDate.localeCompare(a.startDate) || b.endDate.localeCompare(a.endDate))
  for (const sprint of newestFirst) {
    const pbItems = new Map(sprint.items.map((i) => [i.pbItem.id, i.pbItem]))
    const candidates = unfinishedByPbi(withoutTakenOver(sprint.items, takenOver), (i) => ({ pbId: i.pbItem.id, taskName: i.taskName, status: i.status }))
      .map((g) => ({ pbItem: pbItems.get(g.pbId)!, openTasks: g.placeholder ? 0 : g.tasks.length }))
    if (candidates.length > 0) return { sprint, candidates }
  }
  return null
}

// ---------------------------------------------------------------- tabs, time, attention

export type SprintTab = "current" | "planning" | "past"

/** Which tab a sprint lives under: running / in review, being planned, or finished. */
export function sprintTabOf(status: string): SprintTab {
  if (status === "planning") return "planning"
  if (status === "done" || status === "archived") return "past"
  return "current"
}

/** The tab to open first: running work, else the plan being made, else history. */
export function defaultSprintTab(sprints: readonly Pick<Sprint, "status">[]): SprintTab {
  const has = (tab: SprintTab) => sprints.some((s) => sprintTabOf(s.status) === tab)
  return has("current") ? "current" : has("planning") ? "planning" : "past"
}

export type SprintTime =
  | { kind: "startsIn"; days: number }
  | { kind: "daysLeft"; days: number }
  | { kind: "lastDay" }
  | { kind: "over" }

const DAY_MS = 86_400_000

/** Calendar day number (UTC midnight) of an ISO date or datetime string. */
function dayNumber(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS)
}

/** `now` as a calendar day number in the viewer's local time zone. */
function localDayNumber(now: Date): number {
  return Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS)
}

/** Where "today" falls in the sprint's period (calendar days, inclusive of the last day). */
export function sprintTime(sprint: Pick<Sprint, "startDate" | "endDate">, now: Date = new Date()): SprintTime {
  const today = localDayNumber(now)
  const start = dayNumber(sprint.startDate)
  const end = dayNumber(sprint.endDate)
  if (today < start) return { kind: "startsIn", days: start - today }
  if (today > end) return { kind: "over" }
  return today === end ? { kind: "lastDay" } : { kind: "daysLeft", days: end - today }
}

export interface SprintAttention {
  /** Open real tasks nobody is assigned to. */
  unassigned: number
  /** PBIs that still wait for an unfinished prerequisite and have open work. */
  waitingPbis: number
  isOver: boolean
}

/** What needs a look in a sprint, for the header badges (zero everywhere = nothing to flag). */
export function sprintAttention(sprint: Pick<Sprint, "items" | "capacity">): SprintAttention {
  const open = sprint.items.filter((i) => isRealTask(i) && i.status !== "done")
  const hasAssignee = (i: SprintItem) => (i.assignees?.length ?? 0) > 0 || (i.assignee ?? "").trim().length > 0
  const waiting = groupTasksByPb(sprint.items).filter(({ pbItem, tasks }) =>
    waitingOn(pbItem).length > 0 && tasks.some((t) => isRealTask(t) && t.status !== "done"),
  )
  return {
    unassigned: open.filter((i) => !hasAssignee(i)).length,
    waitingPbis: waiting.length,
    isOver: computeSprintMetrics(sprint).isOver,
  }
}

/** The viewer's own open (not done) real tasks. */
export function myOpenTasks(items: readonly SprintItem[], userId: string | null | undefined): SprintItem[] {
  if (!userId) return []
  return items.filter((i) => isRealTask(i) && i.status !== "done" && (i.assignees ?? []).some((a) => a.id === userId))
}

export interface AssigneeGroup {
  /** User id, or null for the unassigned bucket. */
  key: string | null
  name: string | null
  tasks: SprintItem[]
}

/** Real tasks grouped by assignee (a task with several assignees appears under each); unassigned last. */
export function groupTasksByAssignee(items: readonly SprintItem[]): AssigneeGroup[] {
  const order: string[] = []
  const groups = new Map<string, AssigneeGroup>()
  const unassigned: SprintItem[] = []
  for (const item of items.filter(isRealTask)) {
    const owners = item.assignees ?? []
    if (owners.length === 0) {
      unassigned.push(item)
      continue
    }
    for (const a of owners) {
      const existing = groups.get(a.id)
      if (existing) groups.set(a.id, { ...existing, tasks: [...existing.tasks, item] })
      else {
        order.push(a.id)
        groups.set(a.id, { key: a.id, name: a.name, tasks: [item] })
      }
    }
  }
  const named = order.map((id) => groups.get(id)!).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
  return unassigned.length > 0 ? [...named, { key: null, name: null, tasks: unassigned }] : named
}

export interface PbTaskSummary {
  /** Real tasks under the PBI. */
  total: number
  done: number
  /** Sum of the tasks' estimated hours (task unit: hours, never PBI points). */
  estimatedHours: number
  /** done / total in % (0 without tasks). */
  donePercent: number
}

/** Per-PBI task line: task counts and estimated hours, each in its own unit. */
export function summarizePbTasks(tasks: readonly SprintItem[]): PbTaskSummary {
  const real = tasks.filter(isRealTask)
  const done = real.filter((i) => i.status === "done").length
  const estimatedHours = real.reduce((sum, i) => sum + (i.estimatedHours ?? 0), 0)
  return {
    total: real.length,
    done,
    estimatedHours: Math.round(estimatedHours * 10) / 10,
    donePercent: real.length > 0 ? Math.round((done / real.length) * 100) : 0,
  }
}
