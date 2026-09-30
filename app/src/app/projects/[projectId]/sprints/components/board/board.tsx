"use client"

import { Fragment, useEffect, useId, useMemo, useRef } from "react"
import { useLanguage } from "@/lib/language-context"
import { useStableHandlers } from "@/hooks"
import { announce } from "@/components/live-announcer"
import { pickText } from "@/lib/translation/pick-text"
import { BoardCell, BoardColumnHeader } from "./board-column"
import { useBoardDnd, type DndEvent } from "./use-board-dnd"
import { BOARD_STATUSES, buildSwimlanes, summarizeColumns, type BoardStatus, type Swimlane, type SwimlaneMode } from "./board-model"
import type { BoardCardHandlers } from "./board-card"
import type { DropResult } from "./board-dnd-reducer"
import type { Member, SprintItem, SprintTaskActions } from "../types"
import { ClipboardList, User, UserX } from "lucide-react"

interface Props {
  sprintId: string
  sprintName: string
  /** Real (named) tasks after filtering. */
  tasks: readonly SprintItem[]
  swimlane: SwimlaneMode
  members: readonly Member[]
  pointUnit: string
  actions: Pick<SprintTaskActions, "onRequestComplete" | "onQuickUpdateTaskStatus" | "onStartEditTask">
}

/** Columns: at least ~80% of a phone screen (horizontal snap scroll), equal thirds from md up. */
const GRID = "grid grid-cols-[repeat(3,minmax(min(78vw,17rem),1fr))] md:grid-cols-3 gap-2 md:gap-3"

function LaneHeading({ lane }: { lane: Swimlane }) {
  const { t, language } = useLanguage()
  if (lane.kind === "all") return null
  const icon = lane.kind === "pbi" ? <ClipboardList className="h-4 w-4" aria-hidden="true" />
    : lane.kind === "unassigned" ? <UserX className="h-4 w-4" aria-hidden="true" />
    : <User className="h-4 w-4" aria-hidden="true" />
  const title = lane.kind === "pbi" && lane.pbItem
    ? `#${lane.pbItem.displayId} ${pickText(lane.pbItem.i18n, "initiative", lane.pbItem.initiative, language).text
        || pickText(lane.pbItem.i18n, "userStory", lane.pbItem.userStory, language).text}`
    : lane.kind === "unassigned" ? t.sprintUnassigned : lane.title ?? ""
  return (
    <h4 className="col-span-3 mt-2 first:mt-0">
      {/* Sticky so the lane name stays visible while the columns scroll sideways on phones. */}
      <span className="sticky left-0 inline-flex max-w-[calc(100vw-4rem)] items-center gap-1.5 text-caption font-semibold text-fg-muted">
        {icon}
        <span className="truncate">{title}</span>
        <span className="font-normal">({lane.count})</span>
      </span>
    </h4>
  )
}

/** Sprint kanban board: status columns × optional swimlanes, drag & drop between columns. */
export default function Board({ sprintId, sprintName, tasks, swimlane, members, pointUnit, actions }: Props) {
  const { t, language } = useLanguage()
  const rootRef = useRef<HTMLDivElement>(null)
  const pendingFocusRef = useRef<string | null>(null)
  const hintId = useId()

  const columnLabels: Record<BoardStatus, string> = useMemo(
    () => ({ todo: t.taskTodo, in_progress: t.taskInProgress, done: t.taskDone }),
    [t],
  )
  const summaries = useMemo(() => summarizeColumns(tasks), [tasks])
  const lanes = useMemo(() => buildSwimlanes(tasks, swimlane, members), [tasks, swimlane, members])
  const nameOf = (taskId: string) => {
    const task = tasks.find((x) => x.id === taskId)
    return task ? pickText(task.i18n, "taskName", task.taskName, language).text || t.sprintNoTaskName : ""
  }

  function moveTask(task: SprintItem, to: BoardStatus) {
    // Completing asks for the optional completion comment first (same as the list view).
    if (to === "done") {
      actions.onRequestComplete(task)
      return
    }
    pendingFocusRef.current = task.id
    actions.onQuickUpdateTaskStatus(sprintId, task.id, to)
    announce(t.sprintBoardDropped.replace("{name}", nameOf(task.id)).replace("{column}", columnLabels[to]))
  }

  function onDrop({ taskId, to }: DropResult) {
    const task = tasks.find((x) => x.id === taskId)
    if (task) moveTask(task, to)
  }

  function onAnnounce(event: DndEvent) {
    const name = nameOf(event.taskId)
    if (event.type === "cancel") {
      announce(t.sprintBoardCancelled.replace("{name}", name))
      return
    }
    const column = t.sprintBoardOverColumn
      .replace("{column}", columnLabels[event.status])
      .replace("{position}", String(BOARD_STATUSES.indexOf(event.status) + 1))
      .replace("{total}", String(BOARD_STATUSES.length))
    announce(event.type === "pickUp" ? t.sprintBoardPickedUp.replace("{name}", name).replace("{column}", column) : column)
  }

  const dnd = useBoardDnd({ rootRef, onDrop, onAnnounce })

  const handlers = useStableHandlers<BoardCardHandlers>({
    onOpen: (task) => actions.onStartEditTask(sprintId, task),
    onMove: moveTask,
    onPointerDown: dnd.onCardPointerDown,
    onKeyDown: dnd.onCardKeyDown,
    onBlur: dnd.onCardBlur,
    consumeDragClick: dnd.consumeDragClick,
  })

  // Keep focus on a card that moved to another column (it is a new element there).
  useEffect(() => {
    const id = pendingFocusRef.current
    if (!id) return
    const card = rootRef.current?.querySelector<HTMLElement>(`[data-board-card="${CSS.escape(id)}"]`)
    if (card && card !== document.activeElement) card.focus()
    pendingFocusRef.current = null
  }, [tasks])

  const overStatus = dnd.state.phase === "dragging" && dnd.state.over !== dnd.state.from ? dnd.state.over : null

  return (
    <section ref={rootRef} aria-label={t.sprintBoardLabel.replace("{name}", sprintName)}>
      <p id={hintId} className="sr-only">{t.sprintBoardCardHint}</p>
      <div className="-mx-1 overflow-x-auto overscroll-x-contain snap-x snap-mandatory px-1 pb-2 md:snap-none">
        <div className={GRID}>
          {BOARD_STATUSES.map((status) => (
            <BoardColumnHeader key={status} summary={summaries[status]} label={columnLabels[status]}
              pointUnit={pointUnit} isDropTarget={overStatus === status} />
          ))}
          {lanes.map((lane) => (
            <Fragment key={lane.key}>
              <LaneHeading lane={lane} />
              {BOARD_STATUSES.map((status) => (
                <BoardCell key={status} status={status} laneKey={lane.key} tasks={lane.cells[status]}
                  label={lane.kind === "all" ? columnLabels[status] : `${columnLabels[status]} — ${lane.kind === "unassigned" ? t.sprintUnassigned : lane.title ?? `#${lane.pbItem?.displayId ?? ""}`}`}
                  pointUnit={pointUnit} columnLabels={columnLabels} hintId={hintId} dnd={dnd.state} handlers={handlers} />
              ))}
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  )
}
