"use client"

import { forwardRef, memo, useCallback, useId, useMemo, useRef, type KeyboardEvent, type PointerEvent } from "react"
import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { IconButton } from "@/components/ui"
import { ymdToDay } from "../lib/date"
import { COLUMN_WIDTH, NAME_COLUMN_WIDTH, NAME_COLUMN_WIDTH_COMPACT } from "../lib/filter"
import { ROW_HEIGHT, buildArrows, dayCenterX } from "../lib/geometry"
import type { PlanDependency, PlanItem } from "../lib/plan-types"
import type { TimeScale } from "../lib/scale"
import type { FlatRow } from "../lib/tree"
import type { BarDrag, LiveEdit } from "../hooks/use-bar-drag"
import type { ChartEnv, RowHandlers } from "./chart-types"
import { PlanDependencyLayer } from "./plan-dependency-layer"
import { PlanRow } from "./plan-row"
import { HEADER_HEIGHT, PlanScaleHeader } from "./plan-scale-header"

interface Props {
  rows: readonly FlatRow[]
  byId: ReadonlyMap<string, PlanItem>
  dependencies: readonly PlanDependency[]
  scale: TimeScale
  env: ChartEnv
  handlers: RowHandlers
  drag: BarDrag
  live: LiveEdit | null
  selectedId: string | null
  collapsed: ReadonlySet<string>
  renamingId: string | null
  todayLabel: string
  onToggleGrid: () => void
  /** Row drag-reorder (handle). */
  rowDrop: { targetId: string; position: "before" | "after" } | null
  onHandlePointerDown: (e: PointerEvent<HTMLElement>, id: string) => void
}

const NAV_KEYS = new Set(["ArrowUp", "ArrowDown", "Home", "End"])

function GridHeader({ env, onToggleGrid }: Pick<Props, "env" | "onToggleGrid">) {
  const { t } = env
  const labels: Record<string, string> = {
    start: t.planColStart,
    end: t.planColEnd,
    duration: t.planColDuration,
    progress: t.planColProgress,
    owner: t.planColOwner,
    status: t.planColStatus,
  }
  return (
    <div role="none" className="sticky left-0 z-30 flex shrink-0 border-b border-r border-border bg-surface-muted" style={{ width: env.gridWidth, height: HEADER_HEIGHT }}>
      <div role="columnheader" className="flex items-center gap-1 px-2 text-caption font-semibold text-fg-muted" style={{ width: env.gridCollapsed ? NAME_COLUMN_WIDTH_COMPACT : NAME_COLUMN_WIDTH }}>
        <span className="flex-1 truncate">{t.planColName}</span>
        <IconButton
          size="sm"
          label={env.gridCollapsed ? t.planGridExpand : t.planGridCollapse}
          icon={env.gridCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          aria-pressed={env.gridCollapsed}
          onClick={onToggleGrid}
          className="print:hidden"
        />
      </div>
      {env.columns.map((c) => (
        <div key={c} role="columnheader" className="flex items-center px-2 text-caption font-semibold text-fg-muted" style={{ width: COLUMN_WIDTH[c] }}>
          {labels[c]}
        </div>
      ))}
    </div>
  )
}

/** Weekend stripes, today column and the today line behind the rows. */
const ChartBackground = memo(function ChartBackground({ scale, env, height }: { scale: TimeScale; env: ChartEnv; height: number }) {
  const todayOffset = ymdToDay(env.today) - env.startDay
  const inRange = todayOffset >= 0 && todayOffset * env.dayWidth < scale.width
  return (
    <div aria-hidden="true" className="pointer-events-none absolute top-0" style={{ left: env.gridWidth, width: scale.width, height }}>
      {scale.weekendOffsets.map((o) => (
        <div key={o} className="absolute inset-y-0 bg-surface-sunken/70" style={{ left: o * env.dayWidth, width: env.dayWidth }} />
      ))}
      {inRange && (
        <>
          {env.dayWidth >= 14 && <div className="absolute inset-y-0 bg-plan-today/10" style={{ left: todayOffset * env.dayWidth, width: env.dayWidth }} />}
          <div data-plan-today="" className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-plan-today" style={{ left: dayCenterX(env.today, env.startDay, env.dayWidth) }} />
        </>
      )}
    </div>
  )
})

/**
 * The plan chart: one scroll box (both axes) with a sticky header row and a
 * sticky grid column, so the grid and the timeline always stay aligned.
 * Bars use a roving tabindex (one Tab stop; ↑/↓/Home/End move between bars).
 */
export const PlanChart = forwardRef<HTMLDivElement, Props>(function PlanChart(props, ref) {
  const { rows, byId, dependencies, scale, env, handlers, drag, live, selectedId, collapsed, renamingId } = props
  const { t } = env
  const gridHintId = useId()
  const barHintId = useId()
  const bodyRef = useRef<HTMLDivElement>(null)

  const rowIndex = useMemo(() => new Map(rows.map((r, i) => [r.item.id, i])), [rows])
  const arrows = useMemo(
    () => buildArrows(dependencies, byId, rowIndex, env.startDay, env.dayWidth),
    [dependencies, byId, rowIndex, env.startDay, env.dayWidth],
  )
  const tabStopId = selectedId !== null && rowIndex.has(selectedId) ? selectedId : (rows[0]?.item.id ?? null)
  const bodyHeight = rows.length * ROW_HEIGHT

  const onNavigate = useCallback((e: KeyboardEvent<HTMLElement>): boolean => {
    if (!NAV_KEYS.has(e.key)) return false
    e.preventDefault()
    const bars = Array.from(bodyRef.current?.querySelectorAll<HTMLElement>("[data-plan-bar]") ?? [])
    const i = bars.indexOf(e.currentTarget)
    if (i < 0) return true
    const last = bars.length - 1
    const next = e.key === "Home" ? 0 : e.key === "End" ? last : Math.min(last, Math.max(0, i + (e.key === "ArrowUp" ? -1 : 1)))
    bars[next].focus()
    return true
  }, [])

  const dropIndex = props.rowDrop ? (rowIndex.get(props.rowDrop.targetId) ?? 0) + (props.rowDrop.position === "after" ? 1 : 0) : null

  return (
    <div
      ref={ref}
      data-plan-chart=""
      className="relative max-h-[calc(100dvh-15rem)] min-h-72 overflow-auto rounded-ui-lg border border-border bg-surface shadow-ui-sm print:rounded-none print:shadow-none"
    >
      <p id={gridHintId} className="sr-only">{t.planGridKeyboardHint}</p>
      <p id={barHintId} className="sr-only">{t.planBarKeyboardHint}</p>
      <div role="table" aria-label={t.planGridLabel} aria-rowcount={rows.length + 1} className="relative" style={{ width: env.gridWidth + scale.width }}>
        <div role="row" className="sticky top-0 z-20 flex">
          <GridHeader env={env} onToggleGrid={props.onToggleGrid} />
          <div role="columnheader" aria-label={t.planTitle} className="shrink-0">
            <PlanScaleHeader
              scale={scale}
              dayWidth={env.dayWidth}
              todayLabel={props.todayLabel}
              todayX={(() => {
                const x = dayCenterX(env.today, env.startDay, env.dayWidth)
                return x >= 0 && x <= scale.width ? x : null
              })()}
            />
          </div>
        </div>
        <div ref={bodyRef} role="rowgroup" data-plan-body="" className="relative" style={{ minHeight: bodyHeight }}>
          <ChartBackground scale={scale} env={env} height={bodyHeight} />
          <div className="pointer-events-none absolute top-0" style={{ left: env.gridWidth }}>
            <PlanDependencyLayer arrows={arrows} width={scale.width} height={bodyHeight} selectedId={selectedId} violatedLabel={t.planDependencyViolated} />
          </div>
          {rows.map((row) => (
            <PlanRow
              key={row.item.id}
              row={row}
              env={env}
              handlers={handlers}
              drag={drag}
              live={live?.id === row.item.id ? live : null}
              timelineWidth={scale.width}
              selected={row.item.id === selectedId}
              isTabStop={row.item.id === tabStopId}
              collapsed={collapsed.has(row.item.id)}
              renaming={row.item.id === renamingId}
              gridHintId={gridHintId}
              barHintId={barHintId}
              onNavigate={onNavigate}
              onHandlePointerDown={props.onHandlePointerDown}
            />
          ))}
          {dropIndex !== null && (
            <div aria-hidden="true" data-plan-drop="" className="pointer-events-none absolute left-0 z-30 h-0.5 bg-primary" style={{ top: dropIndex * ROW_HEIGHT - 1, width: env.gridWidth }} />
          )}
        </div>
      </div>
    </div>
  )
})

/** Body element (rows container) of a chart root, for row-drag hit testing. */
export function chartBodyOf(root: HTMLElement | null): HTMLElement | null {
  return root?.querySelector<HTMLElement>("[data-plan-body]") ?? null
}
