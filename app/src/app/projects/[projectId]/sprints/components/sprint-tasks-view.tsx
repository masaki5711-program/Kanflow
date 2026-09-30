"use client"

import { useMemo } from "react"
import { useLanguage } from "@/lib/language-context"
import { pickText } from "@/lib/translation/pick-text"
import { Button, EmptyState } from "@/components/ui"
import PbiGroup from "./pbi-group"
import Board from "./board/board"
import BoardFilters from "./board/board-filters"
import { filterTasks, isFilterActive, type FilterContext } from "./board/board-model"
import { groupTasksByPb, isRealTask } from "../lib/sprint-metrics"
import type { BoardViewState } from "../hooks/use-board-view-state"
import type { Member, Sprint, SprintItem, SprintTaskActions } from "./types"
import { CirclePlus, ClipboardList, SearchX } from "lucide-react"

interface Props {
  sprint: Sprint
  sprintName: string
  pointUnit: string
  canEditPbi?: boolean
  canManageSprint: boolean
  viewState: BoardViewState
  members: readonly Member[]
  currentUserId: string | null
  editingCommentTaskId: string | null
  onOpenCommentEditor: (taskId: string) => void
  onCloseCommentEditor: () => void
  actions: SprintTaskActions
  onAddPbi: () => void
}

/** Task area of an expanded sprint: view / filter toolbar + list (PBI groups) or kanban board. */
export default function SprintTasksView({
  sprint, sprintName, pointUnit, canEditPbi, canManageSprint, viewState, members, currentUserId,
  editingCommentTaskId, onOpenCommentEditor, onCloseCommentEditor, actions, onAddPbi,
}: Props) {
  const { t, language } = useLanguage()
  const { view, swimlane, filter } = viewState
  const canEditMembership = canManageSprint && sprint.status !== "archived" && sprint.status !== "done"

  const realTasks = useMemo(() => sprint.items.filter(isRealTask), [sprint.items])
  const filterCtx = useMemo<FilterContext>(() => ({
    currentUserId,
    members,
    // Also match the viewer-language side of translated task / PBI text.
    extraText: (task: SprintItem) => [
      pickText(task.i18n, "taskName", task.taskName, language).text,
      pickText(task.pbItem.i18n, "initiative", task.pbItem.initiative, language).text,
    ],
  }), [currentUserId, members, language])
  const shownTasks = useMemo(() => filterTasks(realTasks, filter, filterCtx), [realTasks, filter, filterCtx])
  const filtering = isFilterActive(filter)
  // Without a filter, PBIs that have no task yet still show (their placeholder row keeps the group).
  const pbGroups = useMemo(() => groupTasksByPb(filtering ? shownTasks : sprint.items), [filtering, shownTasks, sprint.items])

  function renderBody() {
    if (sprint.items.length === 0) {
      return (
        <EmptyState compact headingLevel={4} icon={<ClipboardList className="w-6 h-6" />} title={t.sprintNoTasks}
          action={canEditMembership ? (
            <Button onClick={onAddPbi} leftIcon={<CirclePlus className="w-4 h-4" />}>{t.sprintAddPbi}</Button>
          ) : undefined} />
      )
    }
    if (filtering && shownTasks.length === 0) {
      return (
        <EmptyState compact headingLevel={4} icon={<SearchX className="w-6 h-6" />} title={t.sprintBoardNoMatch}
          action={<Button variant="secondary" onClick={viewState.clearFilters}>{t.sprintBoardFilterClear}</Button>} />
      )
    }
    if (view === "board") {
      return (
        <Board sprintId={sprint.id} sprintName={sprintName} tasks={shownTasks} swimlane={swimlane} members={members}
          actions={actions} />
      )
    }
    return pbGroups.map(({ pbItem, tasks }) => (
      <PbiGroup key={pbItem.id} sprintId={sprint.id} sprintStatus={sprint.status} canManageSprint={canManageSprint} pbItem={pbItem} tasks={tasks}
        pointUnit={pointUnit} canEditPbi={canEditPbi} editingCommentTaskId={editingCommentTaskId}
        onOpenCommentEditor={onOpenCommentEditor} onCloseCommentEditor={onCloseCommentEditor} actions={actions} />
    ))
  }

  return (
    <div className="border-t border-border px-4 sm:px-6 py-4 space-y-4 bg-surface-muted">
      {sprint.items.length > 0 && (
        <BoardFilters state={viewState} members={members} shownCount={shownTasks.length} totalCount={realTasks.length} />
      )}
      {renderBody()}
    </div>
  )
}
