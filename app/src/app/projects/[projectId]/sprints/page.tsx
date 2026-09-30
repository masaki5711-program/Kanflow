"use client"

import { useState } from "react"
import { useStableHandlers } from "@/hooks"
import { useParams } from "next/navigation"
import { useLanguage } from "@/lib/language-context"
import { formatPointUnit } from "@/lib/i18n"
import { pickText } from "@/lib/translation/pick-text"
import PbiDetailModal from "@/components/pbi-detail-modal"
import { Button, DisclosureChevron, EmptyState, SkeletonCard } from "@/components/ui"
import SprintStatusDialog from "./components/sprint-status-dialog"
import TaskFormModal from "./components/task-form-modal"
import SprintCard from "./components/sprint-card"
import AddPbiModal from "./components/add-pbi-modal"
import SprintsHeader from "./components/sprints-header"
import SprintCreateForm from "./components/sprint-create-form"
import type { Sprint, SprintCardActions, SprintItem, StatusDialogState } from "./components/types"
import { useSprintsData } from "./hooks/use-sprints-data"
import { useSprintActions } from "./hooks/use-sprint-actions"
import { useTaskActions } from "./hooks/use-task-actions"
import { useBoardViewState } from "./hooks/use-board-view-state"
import { useSprintDeepLinks } from "./hooks/use-sprint-deep-links"
import { sprintElementId } from "./lib/deep-link"
import { needsRetroDialog, statusDialogFor } from "./lib/task-payload"
import { isSprintStart } from "./lib/status-change"
import { useProjectDocumentTitle } from "@/components/app-shell/project-title-context"
import { Archive, Plus, Zap } from "lucide-react"

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
  const [showArchived, setShowArchived] = useState(false)
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
  const liveSprints = sprints.filter((s) => s.status !== "archived")
  const archivedSprints = sprints.filter((s) => s.status === "archived")
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
      if (s.status === "archived") setShowArchived(true)
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
    onEditCompletionComment: taskActions.editCompletionComment,
    onSendToIcebox: taskActions.sendToIcebox,
  })

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
        archivedCount={archivedSprints.length} showArchived={showArchived}
        onToggleArchived={() => setShowArchived((v) => !v)}
        isCreateBlocked={isCreateBlocked} canCreate={canManageSprint} isCreateLoading={isCreateLoading}
        onCreate={() => setShowForm(true)} />

      {showForm && canManageSprint && !isCreateBlocked && (
        <SprintCreateForm readyPbItems={data.readyPbItems} settings={settings} pointUnitLabel={pointUnit}
          avgActual={avgActual} doneSprintCount={doneSprints.length}
          onCreate={sprintActions.createSprint} onClose={() => setShowForm(false)} onViewPbi={setDetailPbiId} />
      )}

      {data.isLoadingSprints ? (
        <div className="space-y-4">
          <SkeletonCard label={t.loading} />
          <SkeletonCard />
        </div>
      ) : liveSprints.length === 0 && archivedSprints.length === 0 ? (
        // The open create form replaces the "no sprints yet" empty state.
        showForm ? null : (
          <EmptyState icon={<Zap className="w-6 h-6" />} title={t.sprintNoSprints} description={t.sprintNoSprintsHint}
            action={canManageSprint && !isCreateBlocked ? (
              <Button onClick={() => setShowForm(true)} disabled={isCreateLoading} leftIcon={<Plus className="w-4 h-4" />}>{t.sprintCreate}</Button>
            ) : undefined} />
        )
      ) : (
        <ul className="space-y-4">{liveSprints.map(renderCard)}</ul>
      )}

      {archivedSprints.length > 0 && (
        <section className="mt-6" aria-label={t.sprintArchivedSprints}>
          <button type="button" onClick={() => setShowArchived((v) => !v)} aria-expanded={showArchived}
            className="flex items-center gap-2 min-h-8 text-body text-fg-muted hover:text-fg mb-3 transition-colors">
            <DisclosureChevron open={showArchived} className="w-4 h-4" />
            <Archive className="w-4 h-4" />
            <span className="font-medium">{t.sprintArchivedSprints} ({archivedSprints.length})</span>
          </button>
          {showArchived && <ul className="space-y-4 opacity-90">{archivedSprints.map(renderCard)}</ul>}
        </section>
      )}
    </div>
  )
}
