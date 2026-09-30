"use client"

import { useLanguage } from "@/lib/language-context"
import { I18nText } from "@/components/i18n-text"
import { pickText } from "@/lib/translation/pick-text"
import { Button, IconButton, Truncate, cn } from "@/components/ui"
import { fillTemplate } from "@/lib/fill-template"
import { isRealTask, summarizePbTasks } from "../lib/sprint-metrics"
import SprintTaskRow from "./sprint-task-row"
import type { SprintItem, SprintPbItem, SprintTaskActions } from "./types"
import { CirclePlus, ClipboardList, Eye, Scale, SquarePen, Trash2 } from "lucide-react"

interface PbiGroupProps {
  sprintId: string
  sprintStatus: string
  /** sprint.manage — removing a PBI from the sprint. */
  canManageSprint: boolean
  pbItem: SprintPbItem
  tasks: SprintItem[]
  pointUnit: string
  /** When true, the PBI button opens the modal in editable mode. */
  canEditPbi?: boolean
  /** Task id whose completion-comment editor is open (one per sprint card). */
  editingCommentTaskId: string | null
  onOpenCommentEditor: (taskId: string) => void
  onCloseCommentEditor: () => void
  actions: SprintTaskActions
}

export default function PbiGroup({
  sprintId, sprintStatus, canManageSprint, pbItem, tasks, pointUnit, canEditPbi,
  editingCommentTaskId, onOpenCommentEditor, onCloseCommentEditor, actions,
}: PbiGroupProps) {
  const { t, pt, language } = useLanguage()
  // Heading: initiative, falling back to the user story — each in the viewer's language.
  const pbHeading =
    pickText(pbItem.i18n, "initiative", pbItem.initiative, language).text ||
    pickText(pbItem.i18n, "userStory", pbItem.userStory, language).text ||
    t.sprintNotEntered

  const realPbTasks = tasks.filter(isRealTask)
  // Task counts and task hours only — PBI points stay on the badge, never mixed in (S-20).
  const taskSummary = summarizePbTasks(realPbTasks)
  const canEditMembership = canManageSprint && sprintStatus !== "archived" && sprintStatus !== "done"
  // Left accent bar: all done = success, started = primary, untouched = neutral.
  const groupAllDone = realPbTasks.length > 0 && realPbTasks.every((tsk) => tsk.status === "done")
  const groupStarted = realPbTasks.some((tsk) => tsk.status !== "todo")
  const leftBarColor = groupAllDone ? "border-l-success" : groupStarted ? "border-l-primary" : "border-l-border-strong"
  const barColor = groupAllDone ? "bg-success" : "bg-primary"
  const pbRef = `#${pbItem.displayId}`

  return (
    <section aria-label={`${pbRef} ${pbHeading}`}
      className={cn("bg-surface border border-border border-l-4 rounded-ui-sm overflow-hidden", leftBarColor)}>
      <div className="bg-surface-muted border-b border-border px-4 pt-2.5 pb-2">
        <div className="flex flex-wrap items-center justify-between mb-1 gap-2">
          {/* Wraps on phones: the points badge drops below the title instead of sliding under the buttons. */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0 flex-1">
            <ClipboardList className="w-4 h-4 text-fg-subtle flex-shrink-0" />
            <span className="text-caption font-mono text-fg-muted">{pbRef}</span>
            <Truncate text={pbHeading} as="h4" className="text-body font-semibold text-fg min-w-0 flex-1 basis-32" />
            <span className="inline-flex items-center gap-1 text-caption bg-warning-soft text-warning-strong border border-warning/30 px-2 py-0.5 rounded-full whitespace-nowrap">
              <Scale className="w-3.5 h-3.5" />
              {pbItem.workloadScore} {pointUnit}
            </span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <IconButton size="sm" label={`${canEditPbi ? t.edit : t.view}: ${pbRef}`}
              icon={canEditPbi ? <SquarePen className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              onClick={() => actions.onViewPbiDetail(pbItem.id)} />
            <Button size="sm" variant="secondary" leftIcon={<CirclePlus className="w-4 h-4" />}
              onClick={() => actions.onOpenTaskForm(sprintId, pbItem.id)}>
              {t.sprintAddTaskShort}
            </Button>
            {canEditMembership && (
              <IconButton size="sm" label={`${t.sprintRemovePbi}: ${pbRef}`} icon={<Trash2 className="w-4 h-4" />}
                className="hover:text-danger-strong hover:bg-danger-soft"
                onClick={() => actions.onRemovePbi(sprintId, pbItem.id)} />
            )}
          </div>
        </div>

        {taskSummary.total > 0 && (
          <div className="mb-1">
            <div className="flex flex-wrap justify-between gap-x-2 text-caption text-fg-muted mb-0.5">
              <span>{fillTemplate(t.sprintPbiTaskSummary, { done: taskSummary.done, total: taskSummary.total, hours: taskSummary.estimatedHours })}</span>
              <span>{taskSummary.donePercent}%</span>
            </div>
            <div className="w-full bg-surface-sunken rounded-full h-1.5 overflow-hidden" aria-hidden="true">
              <div className={cn("h-1.5 w-full rounded-full origin-left transition-transform duration-300", barColor)}
                style={{ transform: `scaleX(${taskSummary.donePercent / 100})` }} />
            </div>
          </div>
        )}

        {pbItem.epic && (
          <p className="text-caption text-fg-muted mb-1">
            {pt.backlogEpic}: <I18nText i18n={pbItem.i18n} field="epic" original={pbItem.epic} noBadge />
          </p>
        )}
      </div>

      <div className="px-3 py-2">
        {realPbTasks.length === 0 ? (
          <button type="button" onClick={() => actions.onOpenTaskForm(sprintId, pbItem.id)}
            className="w-full border border-dashed border-border-strong rounded-ui-sm py-3 text-caption text-fg-muted hover:border-primary hover:text-primary-strong hover:bg-primary-soft/40 transition-colors">
            + {t.sprintNoTasksYet} — {t.sprintAddTask}
          </button>
        ) : (
          <ul className="divide-y divide-border">
            {realPbTasks.map((task) => (
              <SprintTaskRow key={task.id} sprintId={sprintId} task={task}
                isCommentEditorOpen={editingCommentTaskId === task.id}
                onOpenCommentEditor={onOpenCommentEditor} onCloseCommentEditor={onCloseCommentEditor}
                actions={actions} />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
