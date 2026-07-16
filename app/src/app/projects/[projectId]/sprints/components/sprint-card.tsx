"use client"

import { useState } from "react"
import { useLanguage } from "@/lib/language-context"
import DailyScrumPanel from "./daily-scrum-panel"
import TaskCompleteDialog from "./task-complete-dialog"
import SprintEditDialog from "./sprint-edit-dialog"
import PbiGroup from "./pbi-group"
import {
  IconArrowRight, IconBolt, IconCalendar, IconChatBubble, IconChevron,
  IconGauge, IconPencil, IconPlusCircle, IconTrash,
  StatusIcon, TaskStatusIcon, eventColorBg, statusBadge,
} from "./sprint-icons"
import type { CalendarEvent, Sprint, SprintItem, SprintPbItem } from "./types"

interface SprintCardProps {
  projectId: string
  sprint: Sprint
  events: CalendarEvent[]
  isExpanded: boolean
  onToggleExpand: () => void
  onRequestStatusChange: (sprintId: string, nextStatus: string) => void
  onUpdateSprintStatus: (
    sprintId: string,
    status: string,
    retroPayload: {
      reviewComment?: string | null
      retrospectiveMemo?: string | null
      retrospectiveKeep?: string | null
      retrospectiveProblem?: string | null
      retrospectiveTry?: string | null
    } | null
  ) => void
  onDeleteSprint: (sprintId: string) => void
  onOpenTaskForm: (sprintId: string, pbItemId?: string) => void
  onStartEditTask: (sprintId: string, task: SprintItem) => void
  onDeleteTask: (sprintId: string, taskId: string) => void
  onQuickUpdateTaskStatus: (sprintId: string, taskId: string, status: string, completionComment?: string | null) => void
  onEditCompletionComment: (sprintId: string, taskId: string, completionComment: string) => Promise<void> | void
  /** Push a follow-up item to the project Icebox (e.g. "new issue found while
   * completing this task" or "task didn't actually finish — please re-scope"). */
  onSendToIcebox: (sprintId: string, taskId: string, request: string, background?: string) => Promise<void> | void
  onOpenStatusDialog: (sprint: Sprint) => void
  onAddPbi: (sprintId: string) => void
  onRemovePbi: (sprintId: string, pbItemId: string) => void
  onViewPbiDetail: (pbiId: string) => void
  /** When true, the PBI button opens the modal in editable mode. */
  canEditPbi?: boolean
  pointUnit: string
  onSprintUpdated?: () => void
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
  projectId,
  sprint, events, isExpanded, onToggleExpand, onRequestStatusChange,
  onUpdateSprintStatus, onDeleteSprint, onOpenTaskForm, onStartEditTask,
  onDeleteTask, onQuickUpdateTaskStatus, onEditCompletionComment, onSendToIcebox, onOpenStatusDialog, pointUnit,
  onAddPbi, onRemovePbi, onViewPbiDetail, canEditPbi, onSprintUpdated,
}: SprintCardProps) {
  const { language, t } = useLanguage()

  // Pending task completion: when the user clicks the status icon on a task
  // that's about to become "done", we open a dialog to capture a completion
  // comment. The actual API call only fires when the dialog is confirmed.
  const [pendingDoneTask, setPendingDoneTask] = useState<SprintItem | null>(null)
  const [showSprintEdit, setShowSprintEdit] = useState(false)
  // Daily Scrum is collapsed by default so the PBI/task list is the first
  // thing users see when expanding a sprint (main readability complaint).
  const [showDaily, setShowDaily] = useState(false)
  // Which task's completion-comment editor is open. Kept at card level so
  // only one editor is open per card; the draft text lives in the row itself.
  const [editingCommentTaskId, setEditingCommentTaskId] = useState<string | null>(null)

  const statusLabels: Record<string, string> = {
    planning: t.sprintStatusPlanning, active: t.sprintStatusActive,
    review: t.sprintStatusReview, done: t.sprintStatusDone, archived: t.sprintStatusArchived,
  }

  const isPlaceholder = (i: SprintItem) => !(i.taskName && i.taskName.trim().length > 0)
  const realItems = sprint.items.filter((i) => !isPlaceholder(i))

  const seenPbIds = new Set<string>()
  const currentWorkload = sprint.items.reduce((sum, i) => {
    const pbId = i.pbItem?.id
    if (!pbId || seenPbIds.has(pbId)) return sum
    seenPbIds.add(pbId)
    return sum + (i.pbItem?.workloadScore ?? 0)
  }, 0)
  const isOver = currentWorkload > sprint.capacity
  const progress = sprint.capacity > 0 ? Math.round((currentWorkload / sprint.capacity) * 100) : 0

  // Per-PBI partial completion → smoothly-growing "done" workload so the gauge
  // moves as each task finishes (not only when an entire PBI is wrapped up).
  const pbiTaskAgg = new Map<string, { workload: number; total: number; done: number }>()
  for (const item of sprint.items) {
    const pbId = item.pbItem?.id
    if (!pbId) continue
    if (!pbiTaskAgg.has(pbId)) {
      pbiTaskAgg.set(pbId, { workload: item.pbItem?.workloadScore ?? 0, total: 0, done: 0 })
    }
    if (item.taskName && item.taskName.trim().length > 0) {
      const entry = pbiTaskAgg.get(pbId)!
      entry.total++
      if (item.status === "done") entry.done++
    }
  }
  const completedWorkload = Array.from(pbiTaskAgg.values()).reduce((sum, e) => {
    if (e.total === 0) return sum
    return sum + (e.workload * e.done) / e.total
  }, 0)
  const doneProgress = sprint.capacity > 0
    ? Math.min(100, (completedWorkload / sprint.capacity) * 100)
    : 0
  const committedProgress = sprint.capacity > 0
    ? Math.min(100, (currentWorkload / sprint.capacity) * 100)
    : 0
  const sprintEvents = events.filter((ev) => ev.sprintId === sprint.id)
  const pbGroups = groupTasksByPb(sprint.items)
  const totalTasks = realItems.length
  const doneTasks = realItems.filter((i) => i.status === "done").length
  const inProgressTasks = realItems.filter((i) => i.status === "in_progress").length
  const todoTasks = totalTasks - doneTasks - inProgressTasks

  // Sprint lifecycle: planning → active → review → done (auto-archives).
  // Archived can go back to "active" to undo an accidental completion.
  const nextStatuses: Record<string, string[]> = {
    planning: ["active"], active: ["review", "done"], review: ["done", "active"],
    done: ["active"], archived: ["active"],
  }

  const locale = language === "ja" ? "ja-JP" : language === "id" ? "id-ID" : "en-US"

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* ── Header ── */}
      <div className="px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onToggleExpand} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
            <IconChevron open={isExpanded} />
          </button>
          <IconBolt className="w-5 h-5 text-blue-500 flex-shrink-0" />
          <h3 className="text-lg font-semibold text-gray-900 truncate">{sprint.sprintName}</h3>
          <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${statusBadge[sprint.status] ?? "bg-gray-100"}`}>
            <StatusIcon status={sprint.status} />
            {statusLabels[sprint.status] ?? sprint.status}
          </span>
          {nextStatuses[sprint.status]?.map((ns) => (
            <button key={ns} onClick={() => onRequestStatusChange(sprint.id, ns)}
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors">
              <IconArrowRight className="w-3.5 h-3.5" />
              {statusLabels[ns] ?? ns}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="inline-flex items-center gap-1.5 text-sm text-gray-500">
            <IconCalendar className="w-4 h-4 text-gray-400" />
            {new Date(sprint.startDate).toLocaleDateString(locale)} - {new Date(sprint.endDate).toLocaleDateString(locale)}
          </span>
          {/* Visual group separator: info (date) vs actions */}
          <span className="w-px h-5 bg-gray-200" aria-hidden />
          {sprint.status !== "archived" && sprint.status !== "done" && (
            <button
              onClick={(e) => { e.stopPropagation(); onAddPbi(sprint.id) }}
              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-lg transition-colors"
              title={t.sprintAddPbi}
            >
              <IconPlusCircle className="w-3.5 h-3.5" />
              {t.sprintAddPbi}
            </button>
          )}
          {(sprint.status === "review" || sprint.status === "done") && (
            <button onClick={() => onOpenStatusDialog(sprint)}
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 bg-blue-50 px-2.5 py-1 rounded-lg transition-colors">
              <IconChatBubble className="w-3.5 h-3.5" />
              {t.sprintRetrospectiveMemo}
            </button>
          )}
          {sprint.status !== "archived" && (
            <button
              onClick={() => setShowSprintEdit(true)}
              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 bg-gray-50 hover:bg-gray-100 px-2.5 py-1 rounded-lg transition-colors"
              title={t.sprintEditMenu}
            >
              <IconPencil className="w-3.5 h-3.5" />
              {t.sprintEditMenu}
            </button>
          )}
          {/* Archive button removed — sprints auto-archive when marked done. */}
          {/* Destructive action separated from the edit group */}
          <span className="w-px h-5 bg-gray-200" aria-hidden />
          <button onClick={() => onDeleteSprint(sprint.id)}
            className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
            <IconTrash className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Goal ── */}
      {sprint.sprintGoal && (
        <div className="px-6 pb-2">
          <p className="text-sm text-gray-600 italic whitespace-pre-wrap">{sprint.sprintGoal}</p>
        </div>
      )}

      {/* ── Review / Retro ── */}
      {(sprint.reviewComment
        || sprint.retrospectiveKeep
        || sprint.retrospectiveProblem
        || sprint.retrospectiveTry
        || sprint.retrospectiveMemo) && (
        <div className="px-6 pb-3 space-y-2">
          {sprint.reviewComment && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <span className="text-xs font-semibold text-amber-700">
                {t.sprintReviewComment}
                <span className="text-amber-500 font-normal ml-1">（legacy）</span>
              </span>
              <p className="text-sm text-amber-900 whitespace-pre-wrap mt-0.5">{sprint.reviewComment}</p>
            </div>
          )}
          {(sprint.retrospectiveKeep || sprint.retrospectiveProblem || sprint.retrospectiveTry) && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {sprint.retrospectiveKeep && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500 text-white text-[10px]">K</span>
                    {t.sprintKptKeep}
                  </span>
                  <p className="text-sm text-emerald-900 whitespace-pre-wrap mt-1">{sprint.retrospectiveKeep}</p>
                </div>
              )}
              {sprint.retrospectiveProblem && (
                <div className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700">
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-rose-500 text-white text-[10px]">P</span>
                    {t.sprintKptProblem}
                  </span>
                  <p className="text-sm text-rose-900 whitespace-pre-wrap mt-1">{sprint.retrospectiveProblem}</p>
                </div>
              )}
              {sprint.retrospectiveTry && (
                <div className="bg-sky-50 border border-sky-200 rounded-lg px-3 py-2">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700">
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-sky-500 text-white text-[10px]">T</span>
                    {t.sprintKptTry}
                  </span>
                  <p className="text-sm text-sky-900 whitespace-pre-wrap mt-1">{sprint.retrospectiveTry}</p>
                </div>
              )}
            </div>
          )}
          {sprint.retrospectiveMemo && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <span className="text-xs font-semibold text-gray-600">{t.sprintRetrospectiveOther}</span>
              <p className="text-sm text-gray-800 whitespace-pre-wrap mt-0.5">{sprint.retrospectiveMemo}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Info bar: gauge + task summary ── */}
      <div className="px-6 pb-4 space-y-3">
        {/* Capacity gauge — stacked: green = done tasks, lighter band = committed-but-not-done */}
        <div>
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span className="inline-flex items-center gap-1.5">
              <IconGauge className="w-4 h-4 text-gray-400" />
              {t.sprintWorkload}: {currentWorkload} / {sprint.capacity}
            </span>
            <span className="flex items-center gap-3">
              <span className="text-emerald-600 font-medium">
                {t.sprintActualScore}: {Math.round(completedWorkload * 10) / 10}
              </span>
              <span className={`font-medium ${isOver ? "text-red-600" : "text-gray-500"}`}>{progress}%</span>
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 relative overflow-hidden">
            {/* Committed (lighter band — shows what's been pulled into the sprint) */}
            <div
              className={`absolute inset-y-0 left-0 ${isOver ? "bg-red-200" : "bg-blue-200"}`}
              style={{ width: `${committedProgress}%` }}
            />
            {/* Done (vivid green — grows as each task is completed) */}
            <div
              className="absolute inset-y-0 left-0 bg-emerald-500 transition-all duration-500"
              style={{ width: `${doneProgress}%` }}
            />
          </div>
        </div>
        {/* Task summary */}
        <div className="flex items-center gap-5 text-sm">
          <span className="text-gray-500">{t.sprintTasks}: {totalTasks}</span>
          {totalTasks > 0 && (
            <>
              <span className="inline-flex items-center gap-1 text-emerald-600">
                <TaskStatusIcon status="done" className="w-4 h-4" /> {t.taskDone}: {doneTasks}
              </span>
              <span className="inline-flex items-center gap-1 text-blue-600">
                <TaskStatusIcon status="in_progress" className="w-4 h-4" /> {t.taskInProgress}: {inProgressTasks}
              </span>
              <span className="inline-flex items-center gap-1 text-gray-400">
                <TaskStatusIcon status="todo" className="w-4 h-4" /> {t.taskTodo}: {todoTasks}
              </span>
            </>
          )}
        </div>
      </div>

      {/* ── Daily Scrum (collapsed by default so PBIs/tasks stay on top) ── */}
      {isExpanded && (
        <div className="border-t border-gray-100 px-6 py-2.5 bg-gray-50/50">
          <button
            onClick={() => setShowDaily(!showDaily)}
            className="flex items-center gap-2 w-full text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
          >
            <IconChevron open={showDaily} className="w-4 h-4" />
            <IconChatBubble className="w-4 h-4 text-gray-400" />
            {t.sprintDailyScrum}
          </button>
          {showDaily && (
            <div className="pt-3">
              <DailyScrumPanel
                projectId={projectId}
                sprintId={sprint.id}
                sprintStartDate={sprint.startDate}
                sprintEndDate={sprint.endDate}
                readOnly={sprint.status === "archived"}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Expanded: PBI groups ── */}
      {isExpanded && (
        <div className="border-t border-gray-100 px-6 py-4 space-y-4 bg-gray-50/50">
          {pbGroups.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-gray-400 mb-3">{t.sprintNoTasks}</p>
              {sprint.status !== "archived" && sprint.status !== "done" && (
                <button
                  onClick={() => onAddPbi(sprint.id)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium shadow-sm"
                >
                  <IconPlusCircle className="w-4 h-4" />
                  {t.sprintAddPbi}
                </button>
              )}
            </div>
          ) : pbGroups.map(({ pbItem, tasks }) => (
            <PbiGroup
              key={pbItem.id}
              sprintId={sprint.id}
              sprintStatus={sprint.status}
              pbItem={pbItem}
              tasks={tasks}
              pointUnit={pointUnit}
              canEditPbi={canEditPbi}
              editingCommentTaskId={editingCommentTaskId}
              onOpenCommentEditor={(taskId) => setEditingCommentTaskId(taskId)}
              onCloseCommentEditor={() => setEditingCommentTaskId(null)}
              onRequestComplete={(task) => setPendingDoneTask(task)}
              onQuickUpdateTaskStatus={onQuickUpdateTaskStatus}
              onStartEditTask={onStartEditTask}
              onDeleteTask={onDeleteTask}
              onEditCompletionComment={onEditCompletionComment}
              onSendToIcebox={onSendToIcebox}
              onOpenTaskForm={onOpenTaskForm}
              onRemovePbi={onRemovePbi}
              onViewPbiDetail={onViewPbiDetail}
            />
          ))}
        </div>
      )}

      {/* ── Events ── */}
      {sprintEvents.length > 0 && (
        <div className="border-t border-gray-100 px-6 py-3">
          <p className="text-xs font-medium text-gray-500 mb-2">{t.eventEvents}:</p>
          <div className="flex flex-wrap gap-1.5">
            {sprintEvents.map((ev) => (
              <span key={ev.id} className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border ${eventColorBg[ev.color] ?? eventColorBg.blue}`}>
                <IconCalendar className="w-3.5 h-3.5" />
                {new Date(ev.date).toLocaleDateString("ja-JP", { month: "short", day: "numeric" })} {ev.title}
              </span>
            ))}
          </div>
        </div>
      )}

      {pendingDoneTask && (
        <TaskCompleteDialog
          taskName={pendingDoneTask.taskName}
          onCancel={() => setPendingDoneTask(null)}
          onConfirm={(comment) => {
            const taskId = pendingDoneTask.id
            setPendingDoneTask(null)
            onQuickUpdateTaskStatus(sprint.id, taskId, "done", comment || null)
          }}
        />
      )}

      {showSprintEdit && (
        <SprintEditDialog
          projectId={projectId}
          sprint={sprint}
          onClose={() => setShowSprintEdit(false)}
          onSaved={onSprintUpdated}
        />
      )}
    </div>
  )
}
