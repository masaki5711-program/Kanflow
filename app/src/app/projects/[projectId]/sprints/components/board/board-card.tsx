"use client"

import { memo, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react"
import { useLanguage } from "@/lib/language-context"
import { I18nText } from "@/components/i18n-text"
import { pickText } from "@/lib/translation/pick-text"
import { cn } from "@/components/ui"
import { CommentsButton } from "@/components/comments/comments-provider"
import { GitPbiBadge } from "@/components/git-dev/git-summaries-context"
import { displayAssignees } from "../../lib/task-payload"
import { taskElementId } from "../../lib/deep-link"
import BoardCardMenu from "./board-card-menu"
import type { BoardStatus } from "./board-model"
import type { SprintItem } from "../types"
import { Clock, User } from "lucide-react"

export interface BoardCardHandlers {
  onOpen: (task: SprintItem) => void
  onMove: (task: SprintItem, to: BoardStatus) => void
  onPointerDown: (e: PointerEvent<HTMLElement>, taskId: string, from: BoardStatus, laneKey: string) => void
  /** Returns true when the key was a drag key. */
  onKeyDown: (e: KeyboardEvent<HTMLElement>, taskId: string, from: BoardStatus, laneKey: string) => boolean
  onBlur: (taskId: string) => void
  /** True once for the click that ends a pointer drag. */
  consumeDragClick: () => boolean
}

interface Props {
  task: SprintItem
  status: BoardStatus
  laneKey: string
  columnLabels: Record<BoardStatus, string>
  /** Id of the visually hidden keyboard instructions. */
  hintId: string
  /** Pointer drag offset while this card is being dragged. */
  dragOffset: { dx: number; dy: number } | null
  /** Lifted with the keyboard (Space). */
  isLifted: boolean
  handlers: BoardCardHandlers
}

const stopPropagation = (e: { stopPropagation: () => void }) => e.stopPropagation()

/** One task card (memoized; `handlers` must be stable). */
const BoardCard = memo(function BoardCard({
  task, status, laneKey, columnLabels, hintId, dragOffset, isLifted, handlers,
}: Props) {
  const { t, language } = useLanguage()
  const name = pickText(task.i18n, "taskName", task.taskName, language).text || t.sprintNoTaskName
  const pbTitle =
    pickText(task.pbItem.i18n, "initiative", task.pbItem.initiative, language).text ||
    pickText(task.pbItem.i18n, "userStory", task.pbItem.userStory, language).text
  const [owner, ...others] = displayAssignees(task)
  const hasHours = task.estimatedHours != null || task.actualHours != null
  const isDragging = dragOffset !== null
  const style: CSSProperties | undefined = isDragging
    ? { transform: `translate3d(${dragOffset.dx}px, ${dragOffset.dy}px, 0) rotate(1deg)` }
    : undefined

  return (
    <li
      id={taskElementId(task.id)}
      data-board-card={task.id}
      tabIndex={0}
      aria-roledescription={t.sprintBoardCardRole}
      aria-label={t.sprintBoardCardLabel.replace("{name}", name).replace("{column}", columnLabels[status])}
      aria-describedby={hintId}
      style={style}
      className={cn(
        "group relative select-none rounded-ui-sm border bg-surface p-3 text-left shadow-ui-sm",
        "cursor-grab transition-shadow hover:border-border-strong hover:shadow-ui-md",
        status === "done" ? "border-border bg-surface-muted" : "border-border",
        isDragging && "pointer-events-none z-30 cursor-grabbing shadow-ui-lg ring-2 ring-primary",
        isLifted && "ring-2 ring-primary shadow-ui-lg -translate-y-0.5",
      )}
      onPointerDown={(e) => handlers.onPointerDown(e, task.id, status, laneKey)}
      onKeyDown={(e) => {
        if (handlers.onKeyDown(e, task.id, status, laneKey)) return
        if (e.key === "Enter" && e.target === e.currentTarget) {
          e.preventDefault()
          handlers.onOpen(task)
        }
      }}
      onBlur={(e) => {
        if (e.target === e.currentTarget) handlers.onBlur(task.id)
      }}
      onClick={() => {
        if (!handlers.consumeDragClick()) handlers.onOpen(task)
      }}
    >
      <div className="flex items-start gap-2">
        <p className={cn("flex-1 min-w-0 break-words text-body font-medium", status === "done" ? "text-fg-muted line-through" : "text-fg")}>
          <I18nText i18n={task.i18n} field="taskName" original={task.taskName} fallback={t.sprintNoTaskName} noBadge />
        </p>
        {/* Controls own their clicks / keys; they never open the task or start a drag. */}
        <div data-card-control onClick={stopPropagation} onKeyDown={stopPropagation} className="-mr-1 -mt-1">
          <BoardCardMenu taskName={name} status={status} columnLabels={columnLabels} onMove={(to) => handlers.onMove(task, to)} />
        </div>
      </div>

      <p className="mt-1 flex min-w-0 items-baseline gap-1 text-caption text-fg-muted">
        <span className="sr-only">{t.sprintBoardParentPbi}:</span>
        <span className="font-mono flex-shrink-0">#{task.pbItem.displayId}</span>
        {pbTitle && <span className="truncate" title={pbTitle}>{pbTitle}</span>}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {owner ? (
          <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-caption text-primary-strong">
            <User className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
            <span className="truncate">{owner.name}</span>
            {others.length > 0 && <span>+{others.length}</span>}
          </span>
        ) : (
          <span className="text-caption text-fg-subtle">{t.sprintUnassigned}</span>
        )}
        {hasHours && (
          <span className="inline-flex items-center gap-1 whitespace-nowrap text-caption text-fg-muted"
            title={`${t.sprintEstimatedHoursShort} / ${t.sprintActualHoursShort} (${t.sprintHoursUnit})`}>
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {task.estimatedHours ?? "-"} / {task.actualHours ?? "-"} {t.sprintHoursUnit}
          </span>
        )}
        <GitPbiBadge pbiId={task.pbItem.id} />
        <div data-card-control onClick={stopPropagation} onKeyDown={stopPropagation} className="ml-auto">
          <CommentsButton entityId={task.id} name={name} />
        </div>
      </div>
    </li>
  )
})

export default BoardCard
