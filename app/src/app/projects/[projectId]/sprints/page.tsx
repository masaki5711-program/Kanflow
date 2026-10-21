"use client"

import { useState } from "react"
import { useStableHandlers } from "@/hooks"
import { useParams } from "next/navigation"
import { useLanguage } from "@/lib/language-context"
import { formatPointUnit } from "@/lib/i18n"
import { pickText } from "@/lib/translation/pick-text"
import PbiDetailModal from "@/components/pbi-detail-modal"
import { Button, cn, EmptyState, SkeletonCard } from "@/components/ui"
import SprintStatusDialog from "./components/sprint-status-dialog"
import TaskFormModal from "./components/task-form-modal"
import SprintCard from "./components/sprint-card"
import AddPbiModal from "./components/add-pbi-modal"
import SprintsHeader from "./components/sprints-header"
import PastSprintRow from "./components/past-sprint-row"
import SprintCreateForm from "./components/sprint-create-form"
import type { Sprint, SprintCardActions, SprintItem, StatusDialogState } from "./components/types"
import { useSprintsData } from "./hooks/use-sprints-data"
import { useSprintActions } from "./hooks/use-sprint-actions"
import { useTaskActions } from "./hooks/use-task-actions"
import { useBoardViewState } from "./hooks/use-board-view-state"
import { useSprintDeepLinks } from "./hooks/use-sprint-deep-links"
import { sprintElementId } from "./lib/deep-link"
import { carryOverSource, defaultSprintTab, sprintTabOf, type SprintTab } from "./lib/sprint-metrics"
import { needsRetroDialog, statusDialogFor } from "./lib/task-payload"
import { isSprintStart } from "./lib/status-change"
import { useProjectDocumentTitle } from "@/components/app-shell/project-title-context"
import { Plus, Zap } from "lucide-react"

const IN_FLIGHT_STATUSES: ReadonlySet<string> = new Set(["planning", "active", "review"])

/** Sprints still being worked on start expanded; done / archived start collapsed. */
function isInFlightSprint(s: Pick<Sprint, "status">): boolean {
  return IN_FLIGHT_STATUSES.has(s.status)
}

interface TaskModalState {
  sprintId: string
  task: SprintItem | null
  pbItemId?: string
}

export default function SprintsPage() {
  const params = useParams()
  const projectId = params.projectId as string
  const { language, t, pt } = useLanguage()
  useProjectDocumentTitle(pt.sprintTitle)

  const data = useSprintsData(projectId)
  const { sprints, settings, canEditPbi, canManageSprint } = data
  const sprintActions = useSprintActions(projectId, data)
  const taskActions = useTaskActions(projectId, data)
  const boardView = useBoardViewState(data.userId)

  const [showForm, setShowForm] = useState(false)
  // The tab the user picked; until then the most relevant one (running work, else the plan, else history).
  const [pickedTab, setPickedTab] = useState<SprintTab | null>(null)
  const [addPbiSprintId, setAddPbiSprintId] = useState<string | null>(null)
  const [detailPbiId, setDetailPbiId] = useState<string | null>(null)
  const [statusDialog, setStatusDialog] = useState<StatusDialogState | null>(null)
  const [taskModal, setTaskModal] = useState<TaskModalState | null>(null)
  // Expansion overrides; by default only in-flight sprints (planning / active /
  // review) are expanded — imported PBs + tasks are visible right after
  // creation, while finished sprints stay compact.
  const [expandOverrides, setExpandOverrides] = useState<ReadonlyMap<string, boolean>>(() => new Map())

  const pointUnit = formatPointUnit(settings?.pointUnit, t)
  const doneSprints = sprints.filter((s) => s.status === "done" || s.status === "archived")
  const avgActual = doneSprints.length > 0
    ? Math.round(doneSprints.reduce((sum, s) => sum + s.actualScore, 0) / doneSprints.length)
    : null
  const archivedSprints = sprints.filter((s) => s.status === "archived")
  const tab = pickedTab ?? defaultSprintTab(sprints)
  const sprintsOf = (kind: SprintTab) => sprints.filter((s) => sprintTabOf(s.status) === kind)
  const tabSprints = sprintsOf(tab)
  const tabs: { id: SprintTab; label: string; count: number }[] = [
    { id: "current", label: t.sprintUxTabCurrent, count: sprintsOf("current").length },
    { id: "planning", label: t.sprintUxTabPlanning, count: sprintsOf("planning").length },
    { id: "past", label: t.sprintUxTabPast, count: sprintsOf("past").length },
  ]
  const emptyTabText = { current: t.sprintUxNoCurrent, planning: t.sprintUxNoPlanning, past: t.sprintUxNoPast }[tab]
  // One sprint in flight at a time keeps the backlog from being split.
  const isCreateBlocked = sprints.some((s) => s.status === "active" || s.status === "planning")
  // The create form seeds its dates and capacity from the project defaults (S-16).
  const isCreateLoading = settings === null

  const isExpanded = (s: Sprint) => expandOverrides.get(s.id) ?? isInFlightSprint(s)
  function toggleExpanded(s: Sprint) {
    setExpandOverrides((prev) => new Map(prev).set(s.id, !isExpanded(s)))
  }

  useSprintDeepLinks({
    sprints,
    isReady: !data.isLoadingSprints,
    revealSprint: (s) => {
      setExpandOverrides((prev) => new Map(prev).set(s.id, true))
      setPickedTab(sprintTabOf(s.status))
    },
    filter: boardView.filter,
    clearFilters: boardView.clearFilters,
  })

  function refreshAfterPbiChange() {
    data.refetchSprints()
    data.refetchReady()
  }

  // Stable identities so memoized task rows skip re-rendering on page state changes.
  const cardActions = useStableHandlers<SprintCardActions>({
    onRequestStatusChange: (sprintId, nextStatus) => {
      const sprint = sprints.find((s) => s.id === sprintId)
      if (sprint && needsRetroDialog(nextStatus)) setStatusDialog(statusDialogFor(sprint, nextStatus))
      else if (sprint && isSprintStart(sprint.status, nextStatus)) void sprintActions.startSprint(sprint)
      else void sprintActions.changeStatus(sprintId, nextStatus, null)
    },
    onOpenStatusDialog: (sprint) => setStatusDialog(statusDialogFor(sprint, sprint.status)),
    onDeleteSprint: (sprint) => void sprintActions.deleteSprint(sprint),
    onAddPbi: setAddPbiSprintId,
    onRemovePbi: (sprintId, pbItemId) => void sprintActions.removePbi(sprintId, pbItemId),
    onViewPbiDetail: setDetailPbiId,
    onSprintUpdated: data.refetchSprints,
    onOpenTaskForm: (sprintId, pbItemId) => setTaskModal({ sprintId, task: null, pbItemId }),
    onStartEditTask: (sprintId, task) => setTaskModal({ sprintId, task }),
    onDeleteTask: (sprintId, taskId) => void taskActions.deleteTask(sprintId, taskId),
    onQuickUpdateTaskStatus: (...args) => void taskActions.quickUpdateTaskStatus(...args),
    onPatchTask: (...args) => taskActions.patchTaskFields(...args),
    onQuickAddTask: (...args) => taskActions.quickAddTask(...args),
    onEditCompletionComment: taskActions.editCompletionComment,
    onSendToIcebox: taskActions.sendToIcebox,
  })

  /** A finished sprint is one line until it is opened; everything else is the full card. */
  function renderEntry(sprint: Sprint) {
    if (tab !== "past" || isExpanded(sprint)) return renderCard(sprint)
    return (
      <li key={sprint.id} id={sprintElementId(sprint.id)}>
        <PastSprintRow sprint={sprint} pointUnit={pointUnit} onOpen={() => toggleExpanded(sprint)} />
      </li>
    )
  }

  function renderCard(sprint: Sprint) {
    return (
      <li key={sprint.id} id={sprintElementId(sprint.id)}>
        <SprintCard projectId={projectId} sprint={sprint} events={data.events} pointUnit={pointUnit}
          canEditPbi={canEditPbi} canManageSprint={canManageSprint} isExpanded={isExpanded(sprint)} onToggleExpand={() => toggleExpanded(sprint)}
          actions={cardActions} viewState={boardView} members={data.members} currentUserId={data.userId} />
      </li>
    )
  }

  const taskSprint = taskModal ? sprints.find((s) => s.id === taskModal.sprintId) : undefined
  const statusSprint = statusDialog ? sprints.find((s) => s.id === statusDialog.sprintId) : undefined
  const addPbiSprint = addPbiSprintId ? sprints.find((s) => s.id === addPbiSprintId) : undefined

  return (
    <div>
      {taskModal && taskSprint && (
        <TaskFormModal projectId={projectId} sprint={taskSprint} task={taskModal.task}
          initialPbItemId={taskModal.pbItemId} members={data.members} canEditPbi={canEditPbi}
          onSave={(form, onConflict) => taskActions.saveTask(taskSprint.id, taskModal.task?.id ?? null, form, onConflict)}
          onBulkAdd={(pbItemId, assigneeIds, names) => taskActions.bulkAddTasks(taskSprint.id, pbItemId, assigneeIds, names)}
          onPbiSaved={refreshAfterPbiChange} onClose={() => setTaskModal(null)} />
      )}
      {statusDialog && (
        <SprintStatusDialog projectId={projectId} sprint={statusSprint} initial={statusDialog}
          onSubmit={(fields) => sprintActions.changeStatus(statusDialog.sprintId, statusDialog.nextStatus, fields)}
          onClose={() => setStatusDialog(null)} />
      )}
      {addPbiSprint && canManageSprint && (
        <AddPbiModal
          projectId={projectId}
          sprintId={addPbiSprint.id}
          sprintName={pickText(addPbiSprint.i18n, "sprintName", addPbiSprint.sprintName, language).text}
          existingPbIds={new Set(addPbiSprint.items.map((i) => i.pbItem.id))}
          pointUnit={pointUnit}
          canCreate={canEditPbi}
          onAdded={refreshAfterPbiChange}
          onClose={() => setAddPbiSprintId(null)}
        />
      )}
      {detailPbiId && (
        <PbiDetailModal projectId={projectId} pbiId={detailPbiId} editable={canEditPbi}
          onSaved={refreshAfterPbiChange} onClose={() => setDetailPbiId(null)} />
      )}

      <SprintsHeader projectId={projectId} avgActual={avgActual} doneSprintCount={doneSprints.length}
        archivedCount={archivedSprints.length} showArchived={tab === "past"}
        onToggleArchived={() => setPickedTab(tab === "past" ? (sprintsOf("current").length > 0 ? "current" : "planning") : "past")}
        isCreateBlocked={isCreateBlocked} canCreate={canManageSprint} isCreateLoading={isCreateLoading}
        onCreate={() => setShowForm(true)} />

      {showForm && canManageSprint && !isCreateBlocked && (
        <SprintCreateForm readyPbItems={data.readyPbItems} carryOverSource={carryOverSource(sprints)} settings={settings} pointUnitLabel={pointUnit}
          avgActual={avgActual} doneSprintCount={doneSprints.length}
          onCreate={sprintActions.createSprint} onClose={() => setShowForm(false)} onViewPbi={setDetailPbiId} />
      )}

      {data.isLoadingSprints ? (
        <div className="space-y-4">
          <SkeletonCard label={t.loading} />
          <SkeletonCard />
        </div>
      ) : sprints.length === 0 ? (
        // The open create form replaces the "no sprints yet" empty state.
        showForm ? null : (
          <EmptyState icon={<Zap className="w-6 h-6" />} title={t.sprintNoSprints} description={t.sprintNoSprintsHint}
            action={canManageSprint && !isCreateBlocked ? (
              <Button onClick={() => setShowForm(true)} disabled={isCreateLoading} leftIcon={<Plus className="w-4 h-4" />}>{t.sprintCreate}</Button>
            ) : undefined} />
        )
      ) : (
        <>
          <div role="tablist" aria-label={t.sprintUxTabsLabel} className="mb-4 flex flex-wrap gap-1 border-b border-border">
            {tabs.map((x) => (
              <button key={x.id} type="button" role="tab" id={`sprint-tab-${x.id}`} aria-selected={tab === x.id}
                aria-controls="sprint-tabpanel" onClick={() => setPickedTab(x.id)}
                className={cn(
                  "-mb-px inline-flex min-h-10 items-center gap-2 border-b-2 px-4 text-body font-medium transition-colors",
                  tab === x.id ? "border-primary text-primary-strong" : "border-transparent text-fg-muted hover:text-fg",
                )}>
                {x.label}
                <span className={cn("rounded-full px-1.5 text-caption tabular-nums", tab === x.id ? "bg-primary-soft text-primary-active" : "bg-surface-sunken text-fg-muted")}>{x.count}</span>
              </button>
            ))}
          </div>
          <div role="tabpanel" id="sprint-tabpanel" aria-labelledby={`sprint-tab-${tab}`}>
            {tabSprints.length === 0 ? (
              <p className="rounded-ui-md border border-dashed border-border-strong px-4 py-8 text-center text-body text-fg-muted">{emptyTabText}</p>
            ) : (
              <ul className="space-y-4">{tabSprints.map(renderEntry)}</ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}
