"use client"

import { memo, type KeyboardEvent, type PointerEvent, type ReactNode } from "react"
import { Badge, cn } from "@/components/ui"
import { formatCompactRange, formatFullDate, formatGridDate } from "../lib/date-format"
import { COLUMN_WIDTH } from "../lib/grid-layout"
import { ROW_HEIGHT } from "../lib/geometry"
import type { BarKind } from "../lib/interaction"
import { isDatedItem, type DatedPlanItem, type PlanItem } from "../lib/plan-types"
import type { PlanColumn } from "../lib/prefs"
import { itemBadge } from "../lib/status"
import { fillTemplate } from "../lib/template"
import type { FlatRow } from "../lib/tree"
import type { BarDrag, LiveEdit } from "../hooks/use-bar-drag"
import type { ChartEnv, RowHandlers } from "./chart-types"
import { durationOf } from "../lib/duration"
import { PlanBar } from "./plan-bar"
import { PlanInlineDateCell, type InlineColumn } from "./plan-inline-date"
import { PlanNameCell } from "./plan-name-cell"
import { PlanUndatedMark } from "./plan-undated-mark"

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
  checked: boolean
  gridHintId: string
  barHintId: string
  onNavigate: (e: KeyboardEvent<HTMLElement>) => boolean
  onHandlePointerDown: (e: PointerEvent<HTMLElement>, id: string) => void
}

export function barKindOf(row: FlatRow): BarKind {
  if (row.hasChildren) return "summary"
  return row.item.isMilestone ? "milestone" : "leaf"
}

const CELL_BASE = "flex h-full shrink-0 items-center overflow-hidden whitespace-nowrap px-2 text-body text-fg-muted tabular-nums"
const DATE_COLUMNS: ReadonlySet<PlanColumn> = new Set(["period", "start", "end", "duration"])
const INLINE_COLUMNS: ReadonlySet<PlanColumn> = new Set(["start", "end", "duration"])

/** A start / end / duration cell of a leaf row edits in place (viewers and summary rows stay read-only). */
function inlineColumnOf(column: PlanColumn, item: PlanItem, env: ChartEnv): InlineColumn | null {
  if (!env.canEdit || item.hasChildren || !INLINE_COLUMNS.has(column)) return null
  if (column === "duration" && (item.isMilestone || !item.plannedStart)) return null
  if (!item.plannedStart && column !== "start") return null
  return column as InlineColumn
}

/** Date columns of an undated row (日程未定): one muted label; the duration shows the template's 目安期間. */
function UndatedCell({ column, item, env, handlers }: { column: PlanColumn; item: PlanItem; env: ChartEnv; handlers: RowHandlers }) {
  const { t } = env
  const style = { width: COLUMN_WIDTH[column] }
  const inline = inlineColumnOf(column, item, env)
  if (inline) {
    return (
      <PlanInlineDateCell column={inline} item={item} env={env} onCommit={handlers.editDates} onInvalid={handlers.invalidDates} className={cn(CELL_BASE, "italic text-fg-subtle")} width={COLUMN_WIDTH[column]}>
        <span className="truncate">{t.tplUndated}</span>
      </PlanInlineDateCell>
    )
  }
  if (column === "duration") {
    const hint = item.durationDays && !item.isMilestone ? fillTemplate(t.tplDurationApprox, { n: item.durationDays }) : "—"
    return <div role="cell" data-plan-undated-cell="" className={cn(CELL_BASE, "justify-end")} style={style}>{hint}</div>
  }
  return (
    <div role="cell" data-plan-undated-cell="" className={cn(CELL_BASE, "italic text-fg-subtle")} style={style} title={t.tplUndated}>
      <span className="truncate">{t.tplUndated}</span>
    </div>
  )
}

function ColumnCell({ column, item, env, handlers }: { column: PlanColumn; item: PlanItem; env: ChartEnv; handlers: RowHandlers }) {
  if (isDatedItem(item)) return <DatedColumnCell column={column} item={item} env={env} handlers={handlers} />
  if (DATE_COLUMNS.has(column)) return <UndatedCell column={column} item={item} env={env} handlers={handlers} />
  // Non-date columns never read the planned dates.
  return <DatedColumnCell column={column} item={{ ...item, plannedStart: "", plannedEnd: "" }} env={env} handlers={handlers} />
}

/** The text a start / end / duration cell shows (shared by the read-only and the click-to-edit cell). */
function dateCellContent(column: PlanColumn, item: DatedPlanItem, env: ChartEnv): ReactNode {
  if (column === "duration") return item.isMilestone ? "—" : fillTemplate(env.t.planDaysCount, { n: durationOf(item.plannedStart, item.plannedEnd, env.businessDays) })
  return formatGridDate(column === "start" ? item.plannedStart : item.plannedEnd, env.language)
}

function DatedColumnCell({ column, item, env, handlers }: { column: PlanColumn; item: DatedPlanItem; env: ChartEnv; handlers: RowHandlers }) {
  const inline = inlineColumnOf(column, item, env)
  if (!inline) return <ReadOnlyCell column={column} item={item} env={env} />
  return (
    <PlanInlineDateCell
      column={inline}
      item={item}
      env={env}
      onCommit={handlers.editDates}
      onInvalid={handlers.invalidDates}
      className={CELL_BASE}
      width={COLUMN_WIDTH[column]}
      title={column === "duration" ? undefined : formatFullDate(column === "start" ? item.plannedStart : item.plannedEnd, env.language)}
    >
      {dateCellContent(column, item, env)}
    </PlanInlineDateCell>
  )
}

function ReadOnlyCell({ column, item, env }: { column: PlanColumn; item: DatedPlanItem; env: ChartEnv }) {
  const { t, language } = env
  const base = CELL_BASE
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
          {item.isMilestone ? "—" : fillTemplate(t.planDaysCount, { n: durationOf(item.plannedStart, item.plannedEnd, env.businessDays) })}
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
          checked={props.checked}
          width={env.nameWidth}
          hintId={props.gridHintId}
          onHandlePointerDown={props.onHandlePointerDown}
        />
        {env.columns.map((c) => (
          <ColumnCell key={c} column={c} item={item} env={env} handlers={handlers} />
        ))}
      </div>
      <div role="cell" className="relative shrink-0 print:overflow-hidden" style={{ width: timelineWidth }}>
        {isDatedItem(item) ? (
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
        ) : (
          <PlanUndatedMark
            item={item}
            env={env}
            derived={row.hasChildren}
            selected={selected}
            isTabStop={isTabStop}
            hintId={props.barHintId}
            onSelect={handlers.select}
            onOpen={handlers.open}
            onNavigate={props.onNavigate}
          />
        )}
      </div>
    </div>
  )
})
