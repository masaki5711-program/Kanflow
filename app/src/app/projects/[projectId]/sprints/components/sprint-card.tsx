"use client"

import { useCallback, useMemo, useState } from "react"
import { useLanguage } from "@/lib/language-context"
import { I18nText } from "@/components/i18n-text"
import { Button, DisclosureChevron, EmptyState } from "@/components/ui"
import DailyScrumPanel from "./daily-scrum-panel"
import TaskCompleteDialog from "./task-complete-dialog"
import SprintEditDialog from "./sprint-edit-dialog"
import PbiGroup from "./pbi-group"
import SprintCardHeader from "./sprint-card-header"
import SprintRetroSummary from "./sprint-retro-summary"
import SprintProgress from "./sprint-progress"
import { computeSprintMetrics, groupTasksByPb } from "../lib/sprint-metrics"
import { dateLocale } from "../lib/locale"
import type { CalendarEvent, Sprint, SprintCardActions, SprintItem, SprintTaskActions } from "./types"
import { Calendar, CirclePlus, ClipboardList, MessageSquareText } from "lucide-react"
import { eventColorBg } from "./event-colors"

interface SprintCardProps {
  projectId: string
  sprint: Sprint
  events: CalendarEvent[]
  isExpanded: boolean
  onToggleExpand: () => void
  /** When true, the PBI button opens the modal in editable mode. */
  canEditPbi?: boolean
  pointUnit: string
  actions: SprintCardActions
}

export default function SprintCard({
  projectId, sprint, events, isExpanded, onToggleExpand, canEditPbi, pointUnit, actions,
}: SprintCardProps) {
  const { language, t } = useLanguage()
  // Completing a task opens a dialog for an optional completion comment; the
  // API call fires only once the dialog is confirmed.
  const [pendingDoneTask, setPendingDoneTask] = useState<SprintItem | null>(null)
  const [showSprintEdit, setShowSprintEdit] = useState(false)
  // Daily Scrum is collapsed by default so the PBI/task list comes first.
  const [showDaily, setShowDaily] = useState(false)
  // Only one completion-comment editor per card; the draft lives in the row.
  const [editingCommentTaskId, setEditingCommentTaskId] = useState<string | null>(null)

  const metrics = computeSprintMetrics(sprint)
  const sprintEvents = events.filter((ev) => ev.sprintId === sprint.id)
  const pbGroups = groupTasksByPb(sprint.items)
  const canEditMembership = sprint.status !== "archived" && sprint.status !== "done"
  const locale = dateLocale(language)
  const dailyId = `sprint-daily-${sprint.id}`
  const taskActions: SprintTaskActions = useMemo(() => ({ ...actions, onRequestComplete: setPendingDoneTask }), [actions])
  const closeCommentEditor = useCallback(() => setEditingCommentTaskId(null), [])

  return (
    <article className="bg-surface rounded-ui-md shadow-ui-sm border border-border overflow-hidden">
      <SprintCardHeader sprint={sprint} isExpanded={isExpanded} onToggleExpand={onToggleExpand}
        onEdit={() => setShowSprintEdit(true)} actions={actions} />

      {sprint.sprintGoal && (
        <div className="px-6 pb-2">
          <I18nText as="p" i18n={sprint.i18n} field="sprintGoal" original={sprint.sprintGoal}
            entity={{ type: "sprint", id: sprint.id }} className="text-body text-fg-muted italic whitespace-pre-wrap" />
        </div>
      )}

      <SprintRetroSummary sprint={sprint} />
      <SprintProgress capacity={sprint.capacity} metrics={metrics} />

      {isExpanded && (
        <div id={`sprint-body-${sprint.id}`}>
          <div className="border-t border-border px-6 py-2.5 bg-surface-muted">
            <button type="button" onClick={() => setShowDaily((v) => !v)} aria-expanded={showDaily} aria-controls={dailyId}
              className="flex items-center gap-2 w-full min-h-8 text-body font-medium text-fg-muted hover:text-fg transition-colors">
              <DisclosureChevron open={showDaily} className="w-4 h-4" />
              <MessageSquareText className="w-4 h-4 text-fg-subtle" />
              {t.sprintDailyScrum}
            </button>
            {showDaily && (
              <div id={dailyId} className="pt-3">
                <DailyScrumPanel projectId={projectId} sprintId={sprint.id} sprintStartDate={sprint.startDate}
                  sprintEndDate={sprint.endDate} readOnly={sprint.status === "archived"} />
              </div>
            )}
          </div>

          <div className="border-t border-border px-6 py-4 space-y-4 bg-surface-muted">
            {pbGroups.length === 0 ? (
              <EmptyState compact headingLevel={4} icon={<ClipboardList className="w-6 h-6" />} title={t.sprintNoTasks}
                action={canEditMembership ? (
                  <Button onClick={() => actions.onAddPbi(sprint.id)} leftIcon={<CirclePlus className="w-4 h-4" />}>
                    {t.sprintAddPbi}
                  </Button>
                ) : undefined} />
            ) : pbGroups.map(({ pbItem, tasks }) => (
              <PbiGroup key={pbItem.id} sprintId={sprint.id} sprintStatus={sprint.status} pbItem={pbItem} tasks={tasks}
                pointUnit={pointUnit} canEditPbi={canEditPbi} editingCommentTaskId={editingCommentTaskId}
                onOpenCommentEditor={setEditingCommentTaskId} onCloseCommentEditor={closeCommentEditor}
                actions={taskActions} />
            ))}
          </div>
        </div>
      )}

      {sprintEvents.length > 0 && (
        <div className="border-t border-border px-6 py-3">
          <p className="text-caption font-medium text-fg-muted mb-2">{t.eventEvents}:</p>
          <ul className="flex flex-wrap gap-1.5">
            {sprintEvents.map((ev) => (
              <li key={ev.id} className={`inline-flex items-center gap-1 text-caption px-2.5 py-1 rounded-ui-sm border ${eventColorBg[ev.color] ?? eventColorBg.blue}`}>
                <Calendar className="w-3.5 h-3.5" />
                {new Date(ev.date).toLocaleDateString(locale, { month: "short", day: "numeric" })}{" "}
                <I18nText i18n={ev.i18n} field="title" original={ev.title} noBadge />
              </li>
            ))}
          </ul>
        </div>
      )}

      {pendingDoneTask && (
        <TaskCompleteDialog taskName={pendingDoneTask.taskName} taskI18n={pendingDoneTask.i18n}
          onClose={() => setPendingDoneTask(null)}
          onConfirm={(comment) => {
            const taskId = pendingDoneTask.id
            setPendingDoneTask(null)
            actions.onQuickUpdateTaskStatus(sprint.id, taskId, "done", comment || null)
          }} />
      )}

      {showSprintEdit && (
        <SprintEditDialog projectId={projectId} sprint={sprint} onClose={() => setShowSprintEdit(false)}
          onSaved={actions.onSprintUpdated} />
      )}
    </article>
  )
}
