"use client"

import { useLanguage } from "@/lib/language-context"
import { I18nText } from "@/components/i18n-text"
import { pickText } from "@/lib/translation/pick-text"
import { ActionMenu, IconButton, Truncate, cn, type ActionMenuItem } from "@/components/ui"
import { fillTemplate } from "@/lib/fill-template"
import { isRealTask, summarizePbTasks } from "../lib/sprint-metrics"
import { GitPbiBadge } from "@/components/git-dev/git-summaries-context"
import { PbiDependencyChips } from "@/components/pbi-dependencies/pbi-dependency-chips"
import SprintTaskRow from "./sprint-task-row"
import QuickAddTask from "./quick-add-task"
import type { Member, SprintItem, SprintPbItem, SprintTaskActions } from "./types"
import { ChevronDown, ChevronRight, ClipboardList, Clock, Eye, Scale, SquarePen, Trash2 } from "lucide-react"

interface PbiGroupProps {
  sprintId: string
  sprintStatus: string
  /** sprint.manage — removing a PBI from the sprint. */
  canManageSprint: boolean
  pbItem: SprintPbItem
  tasks: SprintItem[]
  members: readonly Member[]
  pointUnit: string
  /** When true, the PBI button opens the modal in editable mode. */
  canEditPbi?: boolean
  /** Task id whose completion-comment editor is open (one per sprint card). */
  editingCommentTaskId: string | null
  onOpenCommentEditor: (taskId: string) => void
  onCloseCommentEditor: () => void
  actions: SprintTaskActions
  /** The task list is folded away; the header keeps the remaining-task count and a preview. */
  collapsed?: boolean
  onToggleCollapsed?: (pbiId: string) => void
}

/** Remaining task names shown on a folded group before "+n more". */
const COLLAPSED_PREVIEW = 3

/**
 * One PBI of a sprint. The header is two lines: what it is and how far along
 * (id, title, remaining count, open / remove), then quiet facts (points, hours,
 * Git, dependencies, epic). Adding a task is the input row at the end of the list.
 */
export default function PbiGroup({
  sprintId, sprintStatus, canManageSprint, pbItem, tasks, members, pointUnit, canEditPbi,
  editingCommentTaskId, onOpenCommentEditor, onCloseCommentEditor, actions,
  collapsed = false, onToggleCollapsed,
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
  const remainingTasks = realPbTasks.filter((tsk) => tsk.status !== "done")
  const foldable = realPbTasks.length > 0 && !!onToggleCollapsed
  const isFolded = foldable && collapsed
  const bodyId = `pbi-tasks-${pbItem.id}`

  const menu: ActionMenuItem[] = canEditMembership
    ? [{ key: "remove", label: `${t.sprintRemovePbi}: ${pbRef}`, icon: <Trash2 className="h-4 w-4" aria-hidden="true" />, danger: true, onSelect: () => actions.onRemovePbi(sprintId, pbItem.id) }]
    : []

  return (
    <section aria-label={`${pbRef} ${pbHeading}`}
      className={cn("bg-surface border border-border border-l-4 rounded-ui-sm", leftBarColor, groupAllDone && "opacity-90")}>
      <div className="bg-surface-muted border-b border-border px-4 pt-2.5 pb-2 rounded-t-ui-sm">
        <div className="flex items-center gap-2">
          {foldable ? (
            <IconButton size="sm" label={isFolded ? `${t.sprintPbiExpand}: ${pbRef}` : `${t.sprintPbiCollapse}: ${pbRef}`}
              aria-expanded={!isFolded} aria-controls={bodyId}
              icon={isFolded ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              onClick={() => onToggleCollapsed?.(pbItem.id)} />
          ) : (
            <ClipboardList className="w-4 h-4 text-fg-subtle flex-shrink-0" />
          )}
          <span className="text-caption font-mono text-fg-muted">{pbRef}</span>
          <Truncate text={pbHeading} as="h4" className="text-body font-semibold text-fg min-w-0 flex-1" />
          {taskSummary.total > 0 && (
            <span className={cn(
              "inline-flex items-center gap-1 text-caption border px-2 py-0.5 rounded-full whitespace-nowrap",
              remainingTasks.length === 0
                ? "bg-success-soft text-success-strong border-success/30"
                : "bg-primary-soft text-primary-strong border-primary/30",
            )}>
              {remainingTasks.length === 0 ? t.sprintPbiAllDone : fillTemplate(t.sprintPbiRemaining, { n: remainingTasks.length })}
            </span>
          )}
          <IconButton size="sm" label={`${canEditPbi ? t.edit : t.view}: ${pbRef}`}
            icon={canEditPbi ? <SquarePen className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            onClick={() => actions.onViewPbiDetail(pbItem.id)} />
          <ActionMenu label={t.sprintUxMoreActions.replace("{name}", pbRef)} items={menu} />
        </div>

        {/* Quiet facts: points, task hours, Git, dependencies, epic. */}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-9 text-caption text-fg-muted">
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <Scale className="w-3.5 h-3.5" aria-hidden="true" />
            {pbItem.workloadScore} {pointUnit}
          </span>
          {taskSummary.estimatedHours > 0 && (
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <Clock className="w-3.5 h-3.5" aria-hidden="true" />
              {taskSummary.estimatedHours} {t.sprintHoursUnit}
            </span>
          )}
          <GitPbiBadge pbiId={pbItem.id} />
          {/* Waiting for #n / prerequisites done / how many PBIs wait for this one. */}
          <PbiDependencyChips item={pbItem} />
          {pbItem.epic && (
            <span className="min-w-0 truncate">
              {pt.backlogEpic}: <I18nText i18n={pbItem.i18n} field="epic" original={pbItem.epic} noBadge />
            </span>
          )}
        </div>

        {taskSummary.total > 0 && (
          <div className="mt-1.5">
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
      </div>

      {isFolded && remainingTasks.length > 0 && (
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-1.5 text-caption text-fg-muted">
          {remainingTasks.slice(0, COLLAPSED_PREVIEW).map((tsk) => (
            <li key={tsk.id} className="min-w-0 max-w-[16rem] truncate">
              • {pickText(tsk.i18n, "taskName", tsk.taskName, language).text || t.sprintNoTaskName}
            </li>
          ))}
          {remainingTasks.length > COLLAPSED_PREVIEW && (
            <li>{fillTemplate(t.sprintPbiMoreTasks, { n: remainingTasks.length - COLLAPSED_PREVIEW })}</li>
          )}
        </ul>
      )}

      <div id={bodyId} hidden={isFolded} className="px-3 py-2">
        {realPbTasks.length === 0 ? (
          <p className="px-2 pt-1 text-caption text-fg-muted">{t.sprintNoTasksYet}</p>
        ) : (
          <ul className="divide-y divide-border">
            {realPbTasks.map((task) => (
              <SprintTaskRow key={task.id} sprintId={sprintId} task={task} members={members}
                isCommentEditorOpen={editingCommentTaskId === task.id}
                onOpenCommentEditor={onOpenCommentEditor} onCloseCommentEditor={onCloseCommentEditor}
                actions={actions} />
            ))}
          </ul>
        )}
        <QuickAddTask pbRef={pbRef} onAdd={(name) => actions.onQuickAddTask(sprintId, pbItem.id, name)}
          onOpenForm={() => actions.onOpenTaskForm(sprintId, pbItem.id)} />
      </div>
    </section>
  )
}
