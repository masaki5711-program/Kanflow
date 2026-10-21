"use client"

import { memo, useState } from "react"
import { useLanguage } from "@/lib/language-context"
import { I18nText } from "@/components/i18n-text"
import { pickText } from "@/lib/translation/pick-text"
import { ActionMenu, cn, TaskStatusIcon, type ActionMenuItem } from "@/components/ui"
import { nextTaskStatus } from "../lib/sprint-metrics"
import { taskElementId } from "../lib/deep-link"
import CompletionCommentEditor from "./completion-comment-editor"
import { CommentsButton } from "@/components/comments/comments-provider"
import { TaskAssigneeCell, TaskHoursCell, TaskNameEditor } from "./task-inline-cells"
import type { Member, SprintItem, SprintTaskActions } from "./types"
import { Pencil, SquarePen, Trash2 } from "lucide-react"

interface SprintTaskRowProps {
  sprintId: string
  task: SprintItem
  members: readonly Member[]
  /** "#12" shown before the name when rows of several PBIs share one list (assignee grouping). */
  pbLabel?: string
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

/**
 * One task: status toggle, name (double-click or menu → rename in place),
 * owner and estimate (click → edit in place), comments, and a "⋯" menu for
 * rename / full edit / delete. Memoized; parents pass stable `actions` / editor callbacks.
 */
const SprintTaskRow = memo(function SprintTaskRow({
  sprintId, task, members, pbLabel, isCommentEditorOpen, onOpenCommentEditor, onCloseCommentEditor, actions,
}: SprintTaskRowProps) {
  const { t, language } = useLanguage()
  const [renaming, setRenaming] = useState(false)
  const taskStatusLabels: Record<string, string> = { todo: t.taskTodo, in_progress: t.taskInProgress, done: t.taskDone }
  const name = pickText(task.i18n, "taskName", task.taskName, language).text || t.sprintNoTaskName
  const statusLabel = t.sprintStatusClickToggle.replace("{status}", taskStatusLabels[task.status] ?? task.status)
  const showComment = task.status === "done" && (!!task.completionComment?.trim() || isCommentEditorOpen)

  function toggleStatus() {
    const next = nextTaskStatus(task.status)
    if (next === "done") actions.onRequestComplete(task)
    else actions.onQuickUpdateTaskStatus(sprintId, task.id, next)
  }

  const menu: ActionMenuItem[] = [
    { key: "rename", label: t.sprintUxRenameTask.replace("{name}", name), icon: <Pencil className="h-4 w-4" aria-hidden="true" />, onSelect: () => setRenaming(true) },
    { key: "edit", label: t.sprintTaskEditNamed.replace("{name}", name), icon: <SquarePen className="h-4 w-4" aria-hidden="true" />, onSelect: () => actions.onStartEditTask(sprintId, task) },
    { key: "delete", label: t.sprintTaskDeleteNamed.replace("{name}", name), icon: <Trash2 className="h-4 w-4" aria-hidden="true" />, danger: true, onSelect: () => actions.onDeleteTask(sprintId, task.id) },
  ]

  return (
    <li id={taskElementId(task.id)} className="rounded-ui-sm hover:bg-surface-muted group transition-colors">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-2 py-1.5 [[data-density=compact]_&]:py-0">
        <button type="button" onClick={toggleStatus} aria-label={`${name} — ${statusLabel}`} title={statusLabel}
          className={cn("flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full transition-colors", STATUS_COLOR[task.status] ?? STATUS_COLOR.todo)}>
          <TaskStatusIcon status={task.status} className="w-5 h-5" />
        </button>

        {pbLabel && <span className="text-caption font-mono text-fg-muted">{pbLabel}</span>}

        {renaming ? (
          <TaskNameEditor initial={task.taskName ?? ""} label={t.sprintUxRenameTask.replace("{name}", name)}
            onSave={(next) => actions.onPatchTask(sprintId, task.id, { taskName: next })} onClose={() => setRenaming(false)} />
        ) : (
          <span onDoubleClick={() => setRenaming(true)}
            className={cn("text-body flex-1 min-w-[8rem] break-words", task.status === "done" ? "line-through text-fg-subtle" : "text-fg")}>
            <I18nText i18n={task.i18n} field="taskName" original={task.taskName}
              entity={{ type: "sprint_task", id: task.id }} fallback={t.sprintNoTaskName} />
          </span>
        )}

        <TaskAssigneeCell task={task} members={members} label={t.sprintUxChangeAssignee.replace("{name}", name)}
          onSave={(assigneeIds) => actions.onPatchTask(sprintId, task.id, { assigneeIds })} />

        <TaskHoursCell task={task} label={t.sprintUxEditHours.replace("{name}", name)}
          onSave={(estimatedHours) => actions.onPatchTask(sprintId, task.id, { estimatedHours })} />

        <div className="flex items-center gap-0.5">
          <CommentsButton entityId={task.id} name={name} />
          <ActionMenu label={t.sprintUxMoreActions.replace("{name}", name)} items={menu} />
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
