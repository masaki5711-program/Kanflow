// Pure sprint calculations shared by the sprint card and its tests.
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
