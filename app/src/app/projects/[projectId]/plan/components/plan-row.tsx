"use client"

import { memo, type KeyboardEvent, type PointerEvent } from "react"
import { Badge, cn } from "@/components/ui"
import { spanDays } from "../lib/date"
import { formatCompactRange, formatFullDate, formatGridDate } from "../lib/date-format"
import { COLUMN_WIDTH } from "../lib/grid-layout"
import { ROW_HEIGHT } from "../lib/geometry"
import type { BarKind } from "../lib/interaction"
import type { PlanItem } from "../lib/plan-types"
import type { PlanColumn } from "../lib/prefs"
import { itemBadge } from "../lib/status"
import { fillTemplate } from "../lib/template"
import type { FlatRow } from "../lib/tree"
import type { BarDrag, LiveEdit } from "../hooks/use-bar-drag"
import type { ChartEnv, RowHandlers } from "./chart-types"
import { PlanBar } from "./plan-bar"
import { PlanNameCell } from "./plan-name-cell"

interface Props {
  row: FlatRow
  env: ChartEnv
  handlers: RowHandlers
  drag: BarDrag
  live: LiveEdit | null
  timelineWidth: number
  selected: boolean
  isTabStop: boolean
  collapsed: boolean
  renaming: boolean
  gridHintId: string
  barHintId: string
  onNavigate: (e: KeyboardEvent<HTMLElement>) => boolean
  onHandlePointerDown: (e: PointerEvent<HTMLElement>, id: string) => void
}

export function barKindOf(row: FlatRow): BarKind {
  if (row.hasChildren) return "summary"
  return row.item.isMilestone ? "milestone" : "leaf"
}

function ColumnCell({ column, item, env }: { column: PlanColumn; item: PlanItem; env: ChartEnv }) {
  const { t, language } = env
  const base = "flex h-full shrink-0 items-center overflow-hidden whitespace-nowrap px-2 text-body text-fg-muted tabular-nums"
  const style = { width: COLUMN_WIDTH[column] }
  switch (column) {
    case "period": {
      const full = item.isMilestone
        ? formatFullDate(item.plannedEnd, language)
        : `${formatFullDate(item.plannedStart, language)} – ${formatFullDate(item.plannedEnd, language)}`
      return (
        <div role="cell" className={base} style={style} title={full}>
          <span className="truncate">{item.isMilestone ? formatGridDate(item.plannedEnd, language) : formatCompactRange(item.plannedStart, item.plannedEnd, language)}</span>
        </div>
      )
    }
    case "start":
    case "end": {
      const date = column === "start" ? item.plannedStart : item.plannedEnd
      return (
        <div role="cell" className={base} style={style} title={formatFullDate(date, language)}>
          {formatGridDate(date, language)}
        </div>
      )
    }
    case "duration":
      return (
        <div role="cell" className={cn(base, "justify-end")} style={style}>
          {item.isMilestone ? "—" : fillTemplate(t.planDaysCount, { n: spanDays(item.plannedStart, item.plannedEnd) })}
        </div>
      )
    case "progress":
      return (
        <div role="cell" className={cn(base, "gap-1.5")} style={style}>
          <span aria-hidden="true" className="h-1.5 w-10 shrink-0 overflow-hidden rounded-full bg-surface-sunken ring-1 ring-inset ring-border">
            <span className="block h-full bg-primary" style={{ width: `${item.progressPct}%` }} />
          </span>
          <span className="text-caption text-fg">{item.progressPct}%</span>
        </div>
      )
    case "owner":
      return (
        <div role="cell" className={cn(base, "min-w-0")} style={style} title={item.owner?.name}>
          <span className="truncate">{item.owner?.name ?? "—"}</span>
        </div>
      )
    case "status": {
      const badge = itemBadge(t, item)
      return (
        <div role="cell" className={base} style={style} title={badge.label}>
          <Badge tone={badge.tone} dot className="max-w-full">
            <span className="truncate">{badge.label}</span>
          </Badge>
        </div>
      )
    }
  }
}

/**
 * One plan row: the sticky grid part (name + optional columns) and the
 * timeline part (bar). Memoized; all callbacks are stable.
 */
export const PlanRow = memo(function PlanRow(props: Props) {
  const { row, env, handlers, drag, live, timelineWidth, selected, isTabStop, collapsed, renaming } = props
  const { item } = row
  return (
    <div
      role="row"
      data-plan-row={item.id}
      data-selected={selected ? "true" : "false"}
      className={cn("group flex break-inside-avoid border-b border-border", selected ? "bg-primary-soft/50" : "hover:bg-surface-muted/60")}
      style={{ height: ROW_HEIGHT }}
    >
      {/*
        Sticky grid part: opaque, above every timeline decoration (today line / tint, weekend
        stripes, arrows), and a full ROW_HEIGHT tall with its own bottom border, so it also
        covers the row's 1px border line that the decorations would otherwise show through (F-10).
      */}
      <div
        role="none"
        data-plan-grid-cell=""
        className={cn(
          "sticky left-0 z-10 flex shrink-0 self-start border-b border-r border-border focus-within:z-20",
          selected ? "bg-primary-soft" : "bg-surface group-hover:bg-surface-muted",
        )}
        style={{ width: env.gridWidth, height: ROW_HEIGHT }}
      >
        <PlanNameCell
          row={row}
          env={env}
          handlers={handlers}
          collapsed={collapsed}
          renaming={renaming}
          width={env.nameWidth}
          hintId={props.gridHintId}
          onHandlePointerDown={props.onHandlePointerDown}
        />
        {env.columns.map((c) => (
          <ColumnCell key={c} column={c} item={item} env={env} />
        ))}
      </div>
      <div role="cell" className="relative shrink-0 print:overflow-hidden" style={{ width: timelineWidth }}>
        <PlanBar
          item={item}
          kind={barKindOf(row)}
          env={env}
          drag={drag}
          live={live}
          selected={selected}
          isTabStop={isTabStop}
          hintId={props.barHintId}
          onSelect={handlers.select}
          onOpen={handlers.open}
          onStartLink={handlers.startLink}
          onNavigate={props.onNavigate}
        />
      </div>
    </div>
  )
})
