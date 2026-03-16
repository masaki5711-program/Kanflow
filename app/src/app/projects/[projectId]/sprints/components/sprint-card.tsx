"use client"

import { useLanguage } from "@/lib/language-context"

interface SprintPbItem {
  id: string
  displayId: number
  initiative: string | null
  epic: string | null
  userStory: string | null
  workloadScore: number
}

interface SprintItem {
  id: string
  taskName: string | null
  assignee: string | null
  estimatedHours: number | null
  actualHours: number | null
  status: string
  pbItem: SprintPbItem
}

interface Sprint {
  id: string
  sprintName: string
  startDate: string
  endDate: string
  sprintGoal: string | null
  capacity: number
  actualScore: number
  status: string
  reviewComment: string | null
  retrospectiveMemo: string | null
  items: SprintItem[]
}

interface CalendarEvent {
  id: string
  title: string
  description: string | null
  date: string
  endDate: string | null
  color: string
  sprintId: string | null
  sprint: { id: string; sprintName: string } | null
}

interface SprintCardProps {
  sprint: Sprint
  events: CalendarEvent[]
  isExpanded: boolean
  onToggleExpand: () => void
  onRequestStatusChange: (sprintId: string, nextStatus: string) => void
  onUpdateSprintStatus: (sprintId: string, status: string, reviewComment: string | null, retrospectiveMemo: string | null) => void
  onDeleteSprint: (sprintId: string) => void
  onOpenTaskForm: (sprintId: string, pbItemId?: string) => void
  onStartEditTask: (sprintId: string, task: SprintItem) => void
  onDeleteTask: (sprintId: string, taskId: string) => void
  onQuickUpdateTaskStatus: (sprintId: string, taskId: string, status: string) => void
  onOpenStatusDialog: (sprint: Sprint) => void
  pointUnit: string
}

const statusColors: Record<string, string> = {
  planning: "bg-yellow-100 text-yellow-800",
  active: "bg-blue-100 text-blue-800",
  review: "bg-purple-100 text-purple-800",
  done: "bg-green-100 text-green-800",
  archived: "bg-gray-100 text-gray-600",
}

const taskStatusColors: Record<string, string> = {
  todo: "bg-gray-100 text-gray-700",
  in_progress: "bg-blue-100 text-blue-700",
  done: "bg-green-100 text-green-700",
}

const eventColorBg: Record<string, string> = {
  blue: "bg-blue-100 text-blue-800 border-blue-200",
  green: "bg-green-100 text-green-800 border-green-200",
  red: "bg-red-100 text-red-800 border-red-200",
  yellow: "bg-yellow-100 text-yellow-800 border-yellow-200",
  purple: "bg-purple-100 text-purple-800 border-purple-200",
  gray: "bg-gray-100 text-gray-800 border-gray-200",
}

function groupTasksByPb(items: SprintItem[]) {
  const groups: Record<string, { pbItem: SprintPbItem; tasks: SprintItem[] }> = {}
  for (const item of items) {
    const pbId = item.pbItem.id
    if (!groups[pbId]) {
      groups[pbId] = { pbItem: item.pbItem, tasks: [] }
    }
    groups[pbId].tasks.push(item)
  }
  return Object.values(groups)
}

export default function SprintCard({
  sprint,
  events,
  isExpanded,
  onToggleExpand,
  onRequestStatusChange,
  onUpdateSprintStatus,
  onDeleteSprint,
  onOpenTaskForm,
  onStartEditTask,
  onDeleteTask,
  onQuickUpdateTaskStatus,
  onOpenStatusDialog,
  pointUnit,
}: SprintCardProps) {
  const { language, t, pt } = useLanguage()

  const taskStatusLabels: Record<string, string> = {
    todo: t.taskTodo,
    in_progress: t.taskInProgress,
    done: t.taskDone,
  }

  const statusLabels: Record<string, string> = {
    planning: t.sprintStatusPlanning,
    active: t.sprintStatusActive,
    review: t.sprintStatusReview,
    done: t.sprintStatusDone,
    archived: t.sprintStatusArchived,
  }

  const seenPbIds = new Set<string>()
  const currentWorkload = sprint.items.reduce((sum, i) => {
    const pbId = i.pbItem?.id
    if (!pbId || seenPbIds.has(pbId)) return sum
    seenPbIds.add(pbId)
    return sum + (i.pbItem?.workloadScore ?? 0)
  }, 0)
  const isOver = currentWorkload > sprint.capacity
  const progress = sprint.capacity > 0 ? Math.round((currentWorkload / sprint.capacity) * 100) : 0
  const sprintEvents = events.filter((ev) => ev.sprintId === sprint.id)
  const pbGroups = groupTasksByPb(sprint.items)
  const totalTasks = sprint.items.length
  const doneTasks = sprint.items.filter((i) => i.status === "done").length
  const inProgressTasks = sprint.items.filter((i) => i.status === "in_progress").length

  const nextStatuses: Record<string, string[]> = {
    planning: ["active"],
    active: ["review", "done"],
    review: ["done", "active"],
    done: ["review", "active"],
    archived: ["done"],
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleExpand}
            className="text-gray-400 hover:text-gray-600"
          >
            {isExpanded ? "\u25BC" : "\u25B6"}
          </button>
          <h3 className="text-lg font-semibold">{sprint.sprintName}</h3>
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[sprint.status] ?? "bg-gray-100"}`}>{statusLabels[sprint.status] ?? sprint.status}</span>
          {nextStatuses[sprint.status]?.map((ns) => (
            <button
              key={ns}
              onClick={() => onRequestStatusChange(sprint.id, ns)}
              className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-100"
            >
              &rarr; {statusLabels[ns] ?? ns}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">
            {new Date(sprint.startDate).toLocaleDateString(language === "ja" ? "ja-JP" : language === "id" ? "id-ID" : "en-US")} - {new Date(sprint.endDate).toLocaleDateString(language === "ja" ? "ja-JP" : language === "id" ? "id-ID" : "en-US")}
          </span>
          {(sprint.status === "review" || sprint.status === "done") && (
            <button
              onClick={() => onOpenStatusDialog(sprint)}
              className="text-xs text-purple-500 hover:text-purple-700"
            >
              {t.sprintReviewComment} / {t.sprintRetrospectiveMemo}
            </button>
          )}
          {sprint.status === "done" && (
            <button
              onClick={() => onUpdateSprintStatus(sprint.id, "archived", null, null)}
              className="text-xs text-gray-500 hover:text-gray-700 border border-gray-300 px-2 py-0.5 rounded"
            >
              {t.sprintArchive}
            </button>
          )}
          {sprint.status === "archived" && (
            <button
              onClick={() => onUpdateSprintStatus(sprint.id, "done", null, null)}
              className="text-xs text-blue-500 hover:text-blue-700 border border-blue-300 px-2 py-0.5 rounded"
            >
              {t.sprintUnarchive}
            </button>
          )}
          <button
            onClick={() => onDeleteSprint(sprint.id)}
            className="text-xs text-red-400 hover:text-red-600"
          >
            {t.delete}
          </button>
        </div>
      </div>

      {sprint.sprintGoal && <p className="text-sm text-gray-600 mb-3">{sprint.sprintGoal}</p>}

      {/* Review comment & Retrospective memo */}
      {(sprint.reviewComment || sprint.retrospectiveMemo) && (
        <div className="mb-3 space-y-2">
          {sprint.reviewComment && (
            <div className="bg-purple-50 border border-purple-200 rounded-md px-3 py-2">
              <span className="text-xs font-semibold text-purple-700">{t.sprintReviewComment}</span>
              <p className="text-sm text-purple-900 whitespace-pre-wrap mt-0.5">{sprint.reviewComment}</p>
            </div>
          )}
          {sprint.retrospectiveMemo && (
            <div className="bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
              <span className="text-xs font-semibold text-blue-700">{t.sprintRetrospectiveMemo}</span>
              <p className="text-sm text-blue-900 whitespace-pre-wrap mt-0.5">{sprint.retrospectiveMemo}</p>
            </div>
          )}
        </div>
      )}

      {/* Workload gauge & Actual score */}
      <div className="mb-3">
        <div className="flex justify-between text-sm text-gray-600 mb-1">
          <span>{t.sprintWorkload}: {currentWorkload} / {sprint.capacity}</span>
          <span className="flex items-center gap-3">
            <span className="text-green-600 font-medium">{t.sprintActualScore}: {sprint.actualScore}</span>
            <span>{progress}%</span>
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div className={`h-2 rounded-full ${isOver ? "bg-red-500" : progress > 80 ? "bg-yellow-500" : "bg-green-500"}`} style={{ width: `${Math.min(progress, 100)}%` }} />
        </div>
      </div>

      {/* Task summary */}
      <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
        <span>{t.sprintTasks}: {totalTasks}</span>
        {totalTasks > 0 && (
          <>
            <span className="text-green-600">{t.taskDone}: {doneTasks}</span>
            <span className="text-blue-600">{t.taskInProgress}: {inProgressTasks}</span>
            <span className="text-gray-400">{t.taskTodo}: {totalTasks - doneTasks - inProgressTasks}</span>
          </>
        )}
        <button
          onClick={() => onOpenTaskForm(sprint.id)}
          className="ml-auto text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          {t.sprintAddTask}
        </button>
      </div>

      {/* Expanded: tasks grouped by PB item */}
      {isExpanded && (
        <div className="mt-3 border-t border-gray-100 pt-3 space-y-4">
          {pbGroups.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">{t.sprintNoTasks}</p>
          ) : pbGroups.map(({ pbItem, tasks }) => {
            const taskEffortSum = tasks.reduce((sum, tsk) => sum + (tsk.estimatedHours ?? 0), 0)
            const pbCapacity = pbItem.workloadScore
            const pbProgress = pbCapacity > 0 ? Math.round((taskEffortSum / pbCapacity) * 100) : 0
            const pbIsOver = taskEffortSum > pbCapacity && pbCapacity > 0
            return (
            <div key={pbItem.id} className="border border-gray-100 rounded-md p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-gray-400">#{pbItem.displayId}</span>
                  <span className="text-sm font-medium text-gray-800">
                    {pbItem.initiative || pbItem.userStory || t.sprintNotEntered}
                  </span>
                  <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">
                    {pbItem.workloadScore} {pointUnit}
                  </span>
                </div>
                <button
                  onClick={() => onOpenTaskForm(sprint.id, pbItem.id)}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  {t.sprintAddTaskShort}
                </button>
              </div>

              {/* PBI-level effort indicator */}
              {pbCapacity > 0 && (
                <div className="mb-2">
                  <div className="flex justify-between text-xs text-gray-500 mb-0.5">
                    <span>{t.sprintWorkload}: {taskEffortSum} / {pbCapacity} {pointUnit}</span>
                    <span className={pbIsOver ? "text-red-600 font-medium" : ""}>{pbProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${pbIsOver ? "bg-red-500" : pbProgress > 80 ? "bg-yellow-500" : "bg-blue-500"}`}
                      style={{ width: `${Math.min(pbProgress, 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {pbItem.epic && (
                <p className="text-xs text-gray-500 mb-2">{pt.backlogEpic}: {pbItem.epic}</p>
              )}

              <div className="space-y-1">
                {tasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-gray-50 group">
                    {/* Status toggle */}
                    <button
                      onClick={() => {
                        const next = task.status === "todo" ? "in_progress" : task.status === "in_progress" ? "done" : "todo"
                        onQuickUpdateTaskStatus(sprint.id, task.id, next)
                      }}
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        task.status === "done"
                          ? "bg-green-500 border-green-500 text-white"
                          : task.status === "in_progress"
                          ? "bg-blue-500 border-blue-500 text-white"
                          : "border-gray-300 hover:border-gray-400"
                      }`}
                      title={t.sprintStatusClickToggle.replace("{status}", taskStatusLabels[task.status])}
                    >
                      {task.status === "done" && <span className="text-xs">{"\u2713"}</span>}
                      {task.status === "in_progress" && <span className="text-[10px]">{"\u25B6"}</span>}
                    </button>

                    <span className={`text-sm flex-1 ${task.status === "done" ? "line-through text-gray-400" : "text-gray-700"}`}>
                      {task.taskName || t.sprintNoTaskName}
                    </span>

                    {/* Assignee */}
                    {task.assignee ? (
                      <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
                        {task.assignee}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">{t.sprintUnassigned}</span>
                    )}

                    {/* Effort */}
                    {(task.estimatedHours || task.actualHours) && (
                      <span className="text-xs text-gray-400">
                        {task.actualHours ?? "-"}/{task.estimatedHours ?? "-"} {pointUnit}
                      </span>
                    )}

                    {/* Status badge */}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${taskStatusColors[task.status]}`}>
                      {taskStatusLabels[task.status]}
                    </span>

                    {/* Actions */}
                    <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                      <button
                        onClick={() => onStartEditTask(sprint.id, task)}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        {t.edit}
                      </button>
                      <button
                        onClick={() => onDeleteTask(sprint.id, task.id)}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        {t.delete}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            )
          })}
        </div>
      )}

      {/* Events */}
      {sprintEvents.length > 0 && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <p className="text-xs font-medium text-gray-500 mb-2">{t.eventEvents}:</p>
          <div className="flex flex-wrap gap-1">
            {sprintEvents.map((ev) => (
              <span key={ev.id} className={`text-xs px-2 py-0.5 rounded border ${eventColorBg[ev.color] ?? eventColorBg.blue}`}>
                {new Date(ev.date).toLocaleDateString("ja-JP", { month: "short", day: "numeric" })} {ev.title}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
