"use client"

import { useMemo, useState } from "react"
import { useLanguage } from "@/lib/language-context"
import { pickText } from "@/lib/translation/pick-text"
import { Button, EmptyState } from "@/components/ui"
import PbiGroup from "./pbi-group"
import SprintTaskRow from "./sprint-task-row"
import Board from "./board/board"
import BoardFilters from "./board/board-filters"
import { filterTasks, isFilterActive, type FilterContext } from "./board/board-model"
import { groupTasksByAssignee, groupTasksByPb, isRealTask, myOpenTasks, orderByPbDependency } from "../lib/sprint-metrics"
import { useListPrefs } from "../hooks/use-list-prefs"
import type { BoardViewState } from "../hooks/use-board-view-state"
import type { Member, Sprint, SprintItem, SprintTaskActions } from "./types"
import { ChevronsDownUp, ChevronsUpDown, CirclePlus, ClipboardList, SearchX, User } from "lucide-react"

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

/** Task area of an expanded sprint: view / filter toolbar + list (PBI or assignee groups) or kanban board. */
export default function SprintTasksView({
  sprint, sprintName, pointUnit, canEditPbi, canManageSprint, viewState, members, currentUserId,
  editingCommentTaskId, onOpenCommentEditor, onCloseCommentEditor, actions, onAddPbi,
}: Props) {
  const { t, language } = useLanguage()
  const { view, swimlane, filter } = viewState
  const prefs = useListPrefs()
  const canEditMembership = canManageSprint && sprint.status !== "archived" && sprint.status !== "done"

  // PBIs in dependency order (a PBI others wait for comes first) in both the list and the board.
  const orderedItems = useMemo(() => orderByPbDependency(sprint.items), [sprint.items])
  const realTasks = useMemo(() => orderedItems.filter(isRealTask), [orderedItems])
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
  const pbGroups = useMemo(() => groupTasksByPb(filtering ? shownTasks : orderedItems), [filtering, shownTasks, orderedItems])
  const assigneeGroups = useMemo(() => groupTasksByAssignee(shownTasks), [shownTasks])
  const myOpenCount = useMemo(() => myOpenTasks(realTasks, currentUserId).length, [realTasks, currentUserId])

  // PBI groups whose task list is folded (view-only state). A group whose tasks are all done starts folded.
  const [foldedPbis, setFoldedPbis] = useState<ReadonlySet<string>>(
    () => new Set(pbGroups.filter((g) => {
      const real = g.tasks.filter(isRealTask)
      return real.length > 0 && real.every((tsk) => tsk.status === "done")
    }).map((g) => g.pbItem.id)),
  )
  const foldablePbiIds = pbGroups.filter((g) => g.tasks.some(isRealTask)).map((g) => g.pbItem.id)
  const allFolded = foldablePbiIds.length > 0 && foldablePbiIds.every((id) => foldedPbis.has(id))
  function toggleFolded(pbiId: string) {
    setFoldedPbis((prev) => {
      const next = new Set(prev)
      if (!next.delete(pbiId)) next.add(pbiId)
      return next
    })
  }
  function toggleAllFolded() {
    setFoldedPbis(allFolded ? new Set() : new Set(foldablePbiIds))
  }

  function renderAssigneeGroups() {
    return assigneeGroups.map((g) => (
      <section key={g.key ?? "unassigned"} aria-label={g.name ?? t.sprintUnassigned}
        className="rounded-ui-sm border border-border bg-surface">
        <h4 className="flex items-center gap-2 border-b border-border bg-surface-muted px-4 py-2 text-body font-semibold text-fg">
          <User className="h-4 w-4 text-fg-subtle" aria-hidden="true" />
          {g.name ?? t.sprintUnassigned}
          <span className="text-caption font-normal text-fg-muted">({g.tasks.length})</span>
        </h4>
        <ul className="divide-y divide-border px-3 py-2">
          {g.tasks.map((task) => (
            <SprintTaskRow key={task.id} sprintId={sprint.id} task={task} members={members} pbLabel={`#${task.pbItem.displayId}`}
              isCommentEditorOpen={editingCommentTaskId === task.id}
              onOpenCommentEditor={onOpenCommentEditor} onCloseCommentEditor={onCloseCommentEditor} actions={actions} />
          ))}
        </ul>
      </section>
    ))
  }

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
    if (prefs.groupBy === "assignee") return renderAssigneeGroups()
    return pbGroups.map(({ pbItem, tasks }) => (
      <PbiGroup key={pbItem.id} sprintId={sprint.id} sprintStatus={sprint.status} canManageSprint={canManageSprint} pbItem={pbItem} tasks={tasks}
        members={members} pointUnit={pointUnit} canEditPbi={canEditPbi} editingCommentTaskId={editingCommentTaskId}
        onOpenCommentEditor={onOpenCommentEditor} onCloseCommentEditor={onCloseCommentEditor} actions={actions}
        collapsed={foldedPbis.has(pbItem.id)} onToggleCollapsed={toggleFolded} />
    ))
  }

  return (
    <div data-density={prefs.density} className="border-t border-border px-4 sm:px-6 py-4 space-y-4 bg-surface-muted">
      {sprint.items.length > 0 && (
        <BoardFilters state={viewState} members={members} shownCount={shownTasks.length} totalCount={realTasks.length}
          myOpenCount={currentUserId ? myOpenCount : null}
          listPrefs={view === "list" ? prefs : undefined} />
      )}
      {view === "list" && prefs.groupBy === "pbi" && foldablePbiIds.length > 1 && (
        <div className="flex justify-end">
          <Button size="sm" variant="secondary"
            leftIcon={allFolded ? <ChevronsUpDown className="w-4 h-4" /> : <ChevronsDownUp className="w-4 h-4" />}
            onClick={toggleAllFolded}>
            {allFolded ? t.sprintExpandAll : t.sprintCollapseAll}
          </Button>
        </div>
      )}
      {renderBody()}
    </div>
  )
}
