// Pure board logic (columns, filters, swimlanes) shared by the sprint board
// and list views. No React here → unit-tested in the node environment.
import { assigneeIdsOf, displayAssignees } from "../../lib/task-payload"
import type { Member, SprintItem, SprintPbItem } from "../types"

/** Board columns, left to right (the task status set of the API). */
export const BOARD_STATUSES = ["todo", "in_progress", "done"] as const
export type BoardStatus = (typeof BOARD_STATUSES)[number]

export type SwimlaneMode = "none" | "assignee" | "pbi"
export const SWIMLANE_MODES: readonly SwimlaneMode[] = ["none", "assignee", "pbi"]

/** Key of the "no owner" lane in assignee swimlanes. */
export const UNASSIGNED_LANE = "__unassigned"

/** Unknown statuses are shown in the first column instead of disappearing. */
export function boardStatusOf(status: string): BoardStatus {
  return (BOARD_STATUSES as readonly string[]).includes(status) ? (status as BoardStatus) : "todo"
}

// ---------------------------------------------------------------- filters

/**
 * Board / list filter. `assignee`: "" = everyone, "me", "unassigned" or a
 * member's user id. `query`: free text; every whitespace-separated term must match.
 */
export interface TaskFilter {
  assignee: string
  query: string
}

export const EMPTY_FILTER: TaskFilter = { assignee: "", query: "" }

export interface FilterContext {
  currentUserId?: string | null
  members: readonly Member[]
  /** Additional searchable text per task (e.g. the viewer-language translation). */
  extraText?: (task: SprintItem) => readonly string[]
}

export function isFilterActive(filter: TaskFilter): boolean {
  return filter.assignee !== "" || filter.query.trim() !== ""
}

function matchesAssignee(task: SprintItem, assignee: string, ctx: FilterContext): boolean {
  if (assignee === "") return true
  const ids = assigneeIdsOf(task, ctx.members)
  if (assignee === "unassigned") return ids.length === 0 && displayAssignees(task).length === 0
  const wanted = assignee === "me" ? ctx.currentUserId : assignee
  return !!wanted && ids.includes(wanted)
}

function haystackOf(task: SprintItem, ctx: FilterContext): string {
  const pbItem = task.pbItem
  return [
    task.taskName ?? "",
    `#${pbItem.displayId}`,
    pbItem.initiative ?? "",
    pbItem.userStory ?? "",
    ...displayAssignees(task).map((a) => a.name),
    ...(ctx.extraText?.(task) ?? []),
  ].join("\n").toLowerCase()
}

export function matchesFilter(task: SprintItem, filter: TaskFilter, ctx: FilterContext): boolean {
  if (!matchesAssignee(task, filter.assignee, ctx)) return false
  const terms = filter.query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const haystack = haystackOf(task, ctx)
  return terms.every((term) => haystack.includes(term))
}

/** Tasks matching the filter (the input array itself when the filter is inactive). */
export function filterTasks(tasks: readonly SprintItem[], filter: TaskFilter, ctx: FilterContext): readonly SprintItem[] {
  if (!isFilterActive(filter)) return tasks
  return tasks.filter((task) => matchesFilter(task, filter, ctx))
}

// ---------------------------------------------------------------- columns

export interface ColumnSummary {
  status: BoardStatus
  count: number
  estimatedHours: number
  actualHours: number
}

const round1 = (n: number) => Math.round(n * 10) / 10

export function summarizeColumns(tasks: readonly SprintItem[]): Record<BoardStatus, ColumnSummary> {
  const summaryOf = (status: BoardStatus): ColumnSummary => {
    const inColumn = tasks.filter((task) => boardStatusOf(task.status) === status)
    return {
      status,
      count: inColumn.length,
      estimatedHours: round1(inColumn.reduce((sum, task) => sum + (task.estimatedHours ?? 0), 0)),
      actualHours: round1(inColumn.reduce((sum, task) => sum + (task.actualHours ?? 0), 0)),
    }
  }
  return { todo: summaryOf("todo"), in_progress: summaryOf("in_progress"), done: summaryOf("done") }
}

// ---------------------------------------------------------------- swimlanes

export type BoardCells = Record<BoardStatus, readonly SprintItem[]>

export interface Swimlane {
  key: string
  kind: "all" | "assignee" | "unassigned" | "pbi"
  /** Owner name for assignee lanes; null otherwise. */
  title: string | null
  pbItem: SprintPbItem | null
  count: number
  cells: BoardCells
}

function toCells(tasks: readonly SprintItem[]): BoardCells {
  return {
    todo: tasks.filter((task) => boardStatusOf(task.status) === "todo"),
    in_progress: tasks.filter((task) => boardStatusOf(task.status) === "in_progress"),
    done: tasks.filter((task) => boardStatusOf(task.status) === "done"),
  }
}

interface LaneSeed {
  key: string
  kind: Swimlane["kind"]
  title: string | null
  pbItem: SprintPbItem | null
}

/** Group tasks by a lane key, keeping first-seen order. */
function groupLanes(tasks: readonly SprintItem[], seedOf: (task: SprintItem) => LaneSeed): Swimlane[] {
  const order: LaneSeed[] = []
  const byKey = new Map<string, SprintItem[]>()
  for (const task of tasks) {
    const seed = seedOf(task)
    const bucket = byKey.get(seed.key)
    if (bucket) bucket.push(task)
    else {
      order.push(seed)
      byKey.set(seed.key, [task])
    }
  }
  return order.map((seed) => {
    const laneTasks = byKey.get(seed.key) ?? []
    return { ...seed, count: laneTasks.length, cells: toCells(laneTasks) }
  })
}

/** The owner lane of a task (single-owner rule: the first assignee). */
function ownerSeed(task: SprintItem, members: readonly Member[]): LaneSeed {
  const first = displayAssignees(task)[0]
  if (!first) return { key: UNASSIGNED_LANE, kind: "unassigned", title: null, pbItem: null }
  const isNormalized = !!task.assignees && task.assignees.length > 0
  if (isNormalized) return { key: first.key, kind: "assignee", title: first.name, pbItem: null }
  const member = members.find((m) => m.user.name === first.name)
  return member
    ? { key: member.user.id, kind: "assignee", title: member.user.name, pbItem: null }
    : { key: `name:${first.name}`, kind: "assignee", title: first.name, pbItem: null }
}

export function buildSwimlanes(tasks: readonly SprintItem[], mode: SwimlaneMode, members: readonly Member[] = []): Swimlane[] {
  if (mode === "none") {
    return [{ key: "all", kind: "all", title: null, pbItem: null, count: tasks.length, cells: toCells(tasks) }]
  }
  if (mode === "pbi") {
    return groupLanes(tasks, (task) => ({ key: task.pbItem.id, kind: "pbi", title: null, pbItem: task.pbItem }))
  }
  const lanes = groupLanes(tasks, (task) => ownerSeed(task, members))
  return [...lanes.filter((l) => l.kind !== "unassigned"), ...lanes.filter((l) => l.kind === "unassigned")]
}
