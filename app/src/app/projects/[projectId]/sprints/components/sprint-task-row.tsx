"use client"

import { memo } from "react"
import { useLanguage } from "@/lib/language-context"
import { I18nText } from "@/components/i18n-text"
import { pickText } from "@/lib/translation/pick-text"
import { cn, IconButton, TaskStatusIcon } from "@/components/ui"
import { nextTaskStatus } from "../lib/sprint-metrics"
import CompletionCommentEditor from "./completion-comment-editor"
import type { SprintItem, SprintTaskActions } from "./types"
import { Clock, Pencil, Trash2, User } from "lucide-react"

interface SprintTaskRowProps {
  sprintId: string
  task: SprintItem
  pointUnit: string
  /** Only one completion-comment editor is open per sprint card. */
  isCommentEditorOpen: boolean
  onOpenCommentEditor: (taskId: string) => void
  onCloseCommentEditor: () => void
  actions: SprintTaskActions
}

const STATUS_COLOR: Record<string, string> = {
  done: "text-success hover:text-success-hover",
  in_progress: "text-primary hover:text-primary-hover",
  todo: "text-fg-subtle hover:text-fg-muted",
}

/** Memoized row; parents pass stable `actions` / editor callbacks. */
const SprintTaskRow = memo(function SprintTaskRow({
  sprintId, task, pointUnit, isCommentEditorOpen, onOpenCommentEditor, onCloseCommentEditor, actions,
}: SprintTaskRowProps) {
  const { t, language } = useLanguage()
  const taskStatusLabels: Record<string, string> = { todo: t.taskTodo, in_progress: t.taskInProgress, done: t.taskDone }
  const name = pickText(task.i18n, "taskName", task.taskName, language).text || t.sprintNoTaskName
  const assignees = (task.assignee ?? "").split(",").map((a) => a.trim()).filter(Boolean)
  const statusLabel = t.sprintStatusClickToggle.replace("{status}", taskStatusLabels[task.status] ?? task.status)
  const showComment = task.status === "done" && (!!task.completionComment?.trim() || isCommentEditorOpen)

  function toggleStatus() {
    const next = nextTaskStatus(task.status)
    if (next === "done") actions.onRequestComplete(task)
    else actions.onQuickUpdateTaskStatus(sprintId, task.id, next)
  }

  return (
    <li className="rounded-ui-sm hover:bg-surface-muted group transition-colors">
      <div className="flex flex-wrap items-center gap-2.5 py-1.5 px-2">
        <button type="button" onClick={toggleStatus} aria-label={`${name} — ${statusLabel}`} title={statusLabel}
          className={cn("flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full transition-colors", STATUS_COLOR[task.status] ?? STATUS_COLOR.todo)}>
          <TaskStatusIcon status={task.status} className="w-5 h-5" />
        </button>

        <span className={cn("text-body flex-1 min-w-[8rem] break-words", task.status === "done" ? "line-through text-fg-subtle" : "text-fg")}>
          <I18nText i18n={task.i18n} field="taskName" original={task.taskName}
            entity={{ type: "sprint_task", id: task.id }} fallback={t.sprintNoTaskName} />
        </span>

        {assignees.length > 0 ? (
          <ul className="flex flex-wrap items-center gap-1" aria-label={t.sprintAssignee}>
            {assignees.map((a) => (
              <li key={a} className="inline-flex items-center gap-1 text-caption bg-primary-soft text-primary-active px-2 py-0.5 rounded-full">
                <User className="w-3.5 h-3.5" /> {a}
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-caption text-fg-subtle">{t.sprintUnassigned}</span>
        )}

        {(task.estimatedHours || task.actualHours) ? (
          <span className="inline-flex items-center gap-1 text-caption text-fg-muted whitespace-nowrap"
            title={`${t.sprintEstimatedHoursShort} / ${t.sprintActualHoursShort} (${pointUnit})`}>
            <Clock className="w-3.5 h-3.5" />
            {t.sprintEstimatedHoursShort} {task.estimatedHours ?? "-"} · {t.sprintActualHoursShort} {task.actualHours ?? "-"} {pointUnit}
          </span>
        ) : null}

        {/* Always visible (touch has no hover); hover/focus just intensifies. */}
        <div className="opacity-80 group-hover:opacity-100 group-focus-within:opacity-100 flex gap-0.5 transition-opacity">
          <IconButton size="sm" label={t.sprintTaskEditNamed.replace("{name}", name)} icon={<Pencil className="w-4 h-4" />}
            onClick={() => actions.onStartEditTask(sprintId, task)} />
          <IconButton size="sm" label={t.sprintTaskDeleteNamed.replace("{name}", name)} icon={<Trash2 className="w-4 h-4" />}
            className="hover:text-danger-strong hover:bg-danger-soft" onClick={() => actions.onDeleteTask(sprintId, task.id)} />
        </div>
      </div>
      {showComment && (
        <CompletionCommentEditor sprintId={sprintId} task={task} isOpen={isCommentEditorOpen}
          onOpen={() => onOpenCommentEditor(task.id)} onClose={onCloseCommentEditor}
          onSave={actions.onEditCompletionComment} onSendToIcebox={actions.onSendToIcebox} />
      )}
    </li>
  )
})

export default SprintTaskRow
