"use client"

import { useLanguage } from "@/lib/language-context"
import { cn, TaskStatusIcon } from "@/components/ui"
import BoardCard, { type BoardCardHandlers } from "./board-card"
import type { BoardStatus, ColumnSummary } from "./board-model"
import type { DndState } from "./board-dnd-reducer"
import type { SprintItem } from "../types"

const STATUS_ACCENT: Record<BoardStatus, string> = {
  todo: "border-t-border-strong",
  in_progress: "border-t-primary",
  done: "border-t-success",
}

const STATUS_ICON: Record<BoardStatus, string> = {
  todo: "text-fg-subtle",
  in_progress: "text-primary",
  done: "text-success",
}

interface HeaderProps {
  summary: ColumnSummary
  label: string
  isDropTarget: boolean
}

/** Column heading with task count and estimate / actual sums. */
export function BoardColumnHeader({ summary, label, isDropTarget }: HeaderProps) {
  const { t } = useLanguage()
  return (
    <div className={cn(
      "snap-start rounded-ui-sm border border-border border-t-4 bg-surface px-3 py-2",
      STATUS_ACCENT[summary.status],
      isDropTarget && "bg-primary-soft",
    )}>
      <h4 className="flex items-center gap-2 text-body font-semibold text-fg">
        <TaskStatusIcon status={summary.status} className={cn("h-4 w-4", STATUS_ICON[summary.status])} />
        {label}
        <span className="ml-auto rounded-full bg-surface-sunken px-2 text-caption font-medium text-fg-muted">
          {t.sprintBoardColumnCount.replace("{count}", String(summary.count))}
        </span>
      </h4>
      <p className="mt-0.5 text-caption text-fg-muted">
        {t.sprintEstimatedHoursShort} {summary.estimatedHours} · {t.sprintActualHoursShort} {summary.actualHours} {t.sprintHoursUnit}
      </p>
    </div>
  )
}

interface CellProps {
  status: BoardStatus
  laneKey: string
  /** Accessible name of the cell ("進行中" or "進行中 — Alice"). */
  label: string
  tasks: readonly SprintItem[]
  columnLabels: Record<BoardStatus, string>
  hintId: string
  dnd: DndState
  handlers: BoardCardHandlers
}

/** One drop cell (column × lane) holding its cards. */
export function BoardCell({ status, laneKey, label, tasks, columnLabels, hintId, dnd, handlers }: CellProps) {
  const { t } = useLanguage()
  const isDragging = dnd.phase === "dragging"
  const isOverColumn = isDragging && dnd.over === status && dnd.over !== dnd.from
  const isOverCell = isOverColumn && dnd.overLane === laneKey

  return (
    <div
      role="group"
      aria-label={label}
      data-board-drop
      data-board-status={status}
      data-board-lane={laneKey}
      className={cn(
        "flex min-h-24 min-w-0 flex-col gap-2 rounded-ui-sm border border-dashed p-2 transition-colors",
        isOverColumn ? "border-primary bg-primary-soft/60" : "border-transparent bg-surface-sunken/60",
      )}
    >
      {tasks.length > 0 && (
        <ul className="flex flex-col gap-2">
          {tasks.map((task) => (
            <BoardCard key={task.id} task={task} status={status} laneKey={laneKey}
              columnLabels={columnLabels} hintId={hintId} handlers={handlers}
              dragOffset={isDragging && dnd.source === "pointer" && dnd.taskId === task.id ? { dx: dnd.dx, dy: dnd.dy } : null}
              isLifted={isDragging && dnd.source === "keyboard" && dnd.taskId === task.id} />
          ))}
        </ul>
      )}
      {isOverCell ? (
        <p aria-hidden="true"
          className="flex min-h-12 items-center justify-center rounded-ui-sm border-2 border-dashed border-primary text-caption font-medium text-primary-strong">
          {t.sprintBoardDropHere}
        </p>
      ) : tasks.length === 0 ? (
        <p className="py-3 text-center text-caption text-fg-subtle">{t.sprintBoardEmptyColumn}</p>
      ) : null}
    </div>
  )
}
