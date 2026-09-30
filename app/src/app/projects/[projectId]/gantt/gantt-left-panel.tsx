"use client"

import { memo, type ReactNode, type RefObject } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { Badge, Truncate, cn } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { HEADER_HEIGHT, LEFT_PANEL_WIDTH, ROW_HEIGHT, type GanttRow, type GanttText } from "./gantt-types"
import { getInitials, pbiDonePercent, sprintDonePercent, sprintTone, taskTone } from "./gantt-utils"

interface GanttLeftPanelProps {
  rows: GanttRow[]
  text: GanttText
  isExpanded: (key: string) => boolean
  onToggle: (key: string) => void
  hoveredRow: string | null
  onHover: (key: string | null) => void
  scrollRef: RefObject<HTMLDivElement | null>
  onScroll: () => void
}

export function GanttLeftPanel({
  rows,
  text,
  isExpanded,
  onToggle,
  hoveredRow,
  onHover,
  scrollRef,
  onScroll,
}: GanttLeftPanelProps) {
  const { t } = useLanguage()

  return (
    <div className="flex flex-col shrink-0 bg-surface" style={{ width: LEFT_PANEL_WIDTH }}>
      <div
        className="border-b border-r border-border bg-surface-muted flex items-end px-3 pb-1 text-caption font-medium text-fg-muted uppercase tracking-wider"
        style={{ height: HEADER_HEIGHT }}
      >
        {t.ganttColumnHeader}
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden border-r border-border"
        style={{ scrollbarWidth: "none" }}
      >
        <ul style={{ height: rows.length * ROW_HEIGHT }}>
          {rows.map((row) => (
            <GanttLeftRow
              key={row.key}
              row={row}
              text={text}
              expanded={isExpanded(row.key)}
              isHovered={hoveredRow === row.key}
              onToggle={onToggle}
              onHover={onHover}
            />
          ))}
        </ul>
      </div>
    </div>
  )
}

interface GanttLeftRowProps {
  row: GanttRow
  text: GanttText
  expanded: boolean
  isHovered: boolean
  /** Must be stable (useGanttData's `toggle`) for the memo to hold. */
  onToggle: (key: string) => void
  onHover: (key: string | null) => void
}

/** Memoized: hovering one row only re-renders the rows whose hover state changed. */
const GanttLeftRow = memo(function GanttLeftRow({ row, text, expanded, isHovered, onToggle, onHover }: GanttLeftRowProps) {
  return (
    <li
      className={cn("flex items-center border-b border-border hover:bg-surface-muted", isHovered && "bg-primary-soft/40")}
      style={{ height: ROW_HEIGHT }}
      onMouseEnter={() => onHover(row.key)}
      onMouseLeave={() => onHover(null)}
    >
      {row.kind === "task" ? (
        <TaskRow row={row} text={text} />
      ) : (
        <ToggleRow expanded={expanded} onToggle={() => onToggle(row.key)} indent={row.kind === "pbi"}>
          {row.kind === "sprint" ? <SprintRowBody row={row} text={text} /> : <PbiRowBody row={row} text={text} />}
        </ToggleRow>
      )}
    </li>
  )
})

function ToggleRow({
  expanded,
  onToggle,
  indent,
  children,
}: {
  expanded: boolean
  onToggle: () => void
  indent: boolean
  children: ReactNode
}) {
  const Icon = expanded ? ChevronDown : ChevronRight
  return (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={onToggle}
      className={cn("flex items-center gap-2 pr-3 w-full h-full min-w-0 text-left select-none", indent ? "pl-7" : "pl-3")}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5 text-fg-muted shrink-0" />
      {children}
    </button>
  )
}

function SprintRowBody({ row, text }: { row: Extract<GanttRow, { kind: "sprint" }>; text: GanttText }) {
  const { t } = useLanguage()
  const pct = sprintDonePercent(row.sprint)
  return (
    <>
      <Truncate text={text.sprintName(row.sprint)} lines={1} className="text-body font-bold text-fg min-w-0" />
      <Badge tone={sprintTone(row.sprint.status)} className="shrink-0">
        {text.statusLabel(row.sprint.status)}
      </Badge>
      <span className="ml-auto flex items-center gap-2 shrink-0">
        <span className="text-caption text-fg-muted">
          {t.sprintCapacity}: {row.sprint.capacity}
        </span>
        <span aria-hidden="true" className="inline-block w-10 h-1.5 rounded-full bg-surface-sunken overflow-hidden">
          <span className="block h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
        </span>
        <span className="text-caption text-fg-muted w-9 text-right">{pct}%</span>
      </span>
    </>
  )
}

function PbiRowBody({ row, text }: { row: Extract<GanttRow, { kind: "pbi" }>; text: GanttText }) {
  const { t } = useLanguage()
  return (
    <>
      <span className="text-caption font-mono text-fg-muted shrink-0">#{row.pbi.displayId}</span>
      <Truncate text={text.pbiLabel(row.pbi)} lines={1} className="text-caption text-fg min-w-0" />
      <span className="ml-auto flex items-center gap-2 shrink-0">
        {row.pbi.workloadScore > 0 && (
          <Badge tone="warning">
            {t.sprintWorkload}: {row.pbi.workloadScore}
          </Badge>
        )}
        <span className="text-caption text-fg-muted">{pbiDonePercent(row.tasks)}%</span>
      </span>
    </>
  )
}

function TaskRow({ row, text }: { row: Extract<GanttRow, { kind: "task" }>; text: GanttText }) {
  const { t } = useLanguage()
  const { task } = row
  return (
    <div className="flex items-center gap-2 pl-14 pr-3 w-full min-w-0">
      <Badge tone={taskTone(task.status)} className="shrink-0">
        {text.taskStatusLabel(task.status)}
      </Badge>
      <Truncate text={text.taskName(task)} lines={1} className="text-caption text-fg min-w-0" />
      <span className="ml-auto flex items-center gap-2 shrink-0">
        {task.estimatedHours != null && (
          <span className="text-caption text-fg-muted">
            {t.ganttHours
              .replace("{actual}", String(task.actualHours ?? 0))
              .replace("{estimated}", String(task.estimatedHours))}
          </span>
        )}
        {task.assignee && (
          <span
            className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-surface-sunken text-caption font-bold text-fg-muted shrink-0"
            title={task.assignee}
          >
            <span aria-hidden="true">{getInitials(task.assignee)}</span>
            <span className="sr-only">
              {t.ganttAssignee}: {task.assignee}
            </span>
          </span>
        )}
      </span>
    </div>
  )
}
