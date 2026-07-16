"use client"

import { useLanguage } from "@/lib/language-context"
import {
  IconClipboard, IconEditPencilAlt, IconEye, IconPlusCircle, IconScale, IconTrash,
} from "./sprint-icons"
import SprintTaskRow from "./sprint-task-row"
import type { SprintItem, SprintPbItem } from "./types"

interface PbiGroupProps {
  sprintId: string
  sprintStatus: string
  pbItem: SprintPbItem
  tasks: SprintItem[]
  pointUnit: string
  /** When true, the PBI button opens the modal in editable mode. */
  canEditPbi?: boolean
  /** Task id whose completion-comment editor is open (one per sprint card). */
  editingCommentTaskId: string | null
  onOpenCommentEditor: (taskId: string) => void
  onCloseCommentEditor: () => void
  onRequestComplete: (task: SprintItem) => void
  onQuickUpdateTaskStatus: (sprintId: string, taskId: string, status: string, completionComment?: string | null) => void
  onStartEditTask: (sprintId: string, task: SprintItem) => void
  onDeleteTask: (sprintId: string, taskId: string) => void
  onEditCompletionComment: (sprintId: string, taskId: string, completionComment: string) => Promise<void> | void
  onSendToIcebox: (sprintId: string, taskId: string, request: string, background?: string) => Promise<void> | void
  onOpenTaskForm: (sprintId: string, pbItemId?: string) => void
  onRemovePbi: (sprintId: string, pbItemId: string) => void
  onViewPbiDetail: (pbiId: string) => void
}

export default function PbiGroup({
  sprintId, sprintStatus, pbItem, tasks, pointUnit, canEditPbi,
  editingCommentTaskId, onOpenCommentEditor, onCloseCommentEditor,
  onRequestComplete, onQuickUpdateTaskStatus, onStartEditTask, onDeleteTask,
  onEditCompletionComment, onSendToIcebox, onOpenTaskForm, onRemovePbi, onViewPbiDetail,
}: PbiGroupProps) {
  const { t, pt } = useLanguage()

  const realPbTasks = tasks.filter((tsk) => (tsk.taskName ?? "").trim().length > 0)
  const taskEffortSum = realPbTasks.reduce((sum, tsk) => sum + (tsk.estimatedHours ?? 0), 0)
  const pbCapacity = pbItem.workloadScore
  const pbProgress = pbCapacity > 0 ? Math.round((taskEffortSum / pbCapacity) * 100) : 0
  const pbIsOver = taskEffortSum > pbCapacity && pbCapacity > 0
  const canEditMembership = sprintStatus !== "archived" && sprintStatus !== "done"
  // Left accent bar reflects the PBI's task progress at a glance:
  // all done = emerald, started = blue, untouched = slate.
  const groupAllDone = realPbTasks.length > 0 && realPbTasks.every((tsk) => tsk.status === "done")
  const groupStarted = realPbTasks.some((tsk) => tsk.status !== "todo")
  const leftBarColor = groupAllDone ? "border-l-emerald-500" : groupStarted ? "border-l-blue-500" : "border-l-slate-300"

  return (
    <div className={`bg-white border border-gray-200 border-l-4 ${leftBarColor} rounded-lg overflow-hidden`}>
      {/* PBI header band — visually separates the PBI "heading" from its task list */}
      <div className="bg-slate-50 border-b border-gray-200 px-4 pt-2.5 pb-2">
        <div className="flex items-center justify-between mb-1 gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <IconClipboard className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="text-xs font-mono text-gray-500">#{pbItem.displayId}</span>
            <span className="text-sm font-semibold text-gray-900 truncate">
              {pbItem.initiative || pbItem.userStory || t.sprintNotEntered}
            </span>
            <span className="inline-flex items-center gap-1 text-xs bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full">
              <IconScale />
              {pbItem.workloadScore} {pointUnit}
            </span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => onViewPbiDetail(pbItem.id)}
              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title={canEditPbi ? t.edit : t.view}>
              {canEditPbi ? <IconEditPencilAlt className="w-4 h-4" /> : <IconEye className="w-4 h-4" />}
            </button>
            <button onClick={() => onOpenTaskForm(sprintId, pbItem.id)}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-1 rounded-lg transition-colors">
              <IconPlusCircle className="w-4 h-4" />
              {t.sprintAddTaskShort}
            </button>
            {canEditMembership && (
              <button onClick={() => onRemovePbi(sprintId, pbItem.id)}
                className="p-1.5 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title={t.sprintRemovePbi}>
                <IconTrash className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* PBI progress bar */}
        {pbCapacity > 0 && (
          <div className="mb-1">
            <div className="flex justify-between text-xs text-gray-500 mb-0.5">
              <span>{t.sprintTaskEstimateTotal}: {taskEffortSum} / {pbCapacity} {pointUnit}</span>
              <span className={pbIsOver ? "text-red-600 font-medium" : ""}>{pbProgress}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5">
              <div className={`h-1.5 rounded-full transition-all duration-300 ${pbIsOver ? "bg-red-500" : pbProgress > 80 ? "bg-amber-400" : "bg-blue-500"}`}
                style={{ width: `${Math.min(pbProgress, 100)}%` }} />
            </div>
          </div>
        )}

        {pbItem.epic && (
          <p className="text-xs text-gray-500 mb-1">{pt.backlogEpic}: {pbItem.epic}</p>
        )}
      </div>

      {/* Tasks */}
      <div className="px-3 py-2">
        {realPbTasks.length === 0 ? (
          <button
            onClick={() => onOpenTaskForm(sprintId, pbItem.id)}
            className="w-full border border-dashed border-gray-300 rounded-lg py-3 text-xs text-gray-400 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50/40 transition-colors"
          >
            + {t.sprintNoTasksYet} — {t.sprintAddTask}
          </button>
        ) : (
          <div className="divide-y divide-gray-100">
            {realPbTasks.map((task) => (
              <SprintTaskRow
                key={task.id}
                sprintId={sprintId}
                task={task}
                pointUnit={pointUnit}
                isCommentEditorOpen={editingCommentTaskId === task.id}
                onOpenCommentEditor={onOpenCommentEditor}
                onCloseCommentEditor={onCloseCommentEditor}
                onRequestComplete={onRequestComplete}
                onQuickUpdateTaskStatus={onQuickUpdateTaskStatus}
                onStartEditTask={onStartEditTask}
                onDeleteTask={onDeleteTask}
                onEditCompletionComment={onEditCompletionComment}
                onSendToIcebox={onSendToIcebox}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
