"use client"

import { memo, useEffect, useRef, type KeyboardEvent, type PointerEvent } from "react"
import { cn } from "@/components/ui"
import { formatFullDate } from "../lib/date-format"
import { ROW_CENTER, ROW_LAYOUT, dayCenterX, spanGeometry } from "../lib/geometry"
import { estimateTextWidth } from "../lib/scale-labels"
import type { BarKind } from "../lib/interaction"
import type { DatedPlanItem, PlanItem } from "../lib/plan-types"
import { barFillClass, itemBadge, milestoneClass } from "../lib/status"
import { fillTemplate } from "../lib/template"
import type { BarDrag, LiveEdit } from "../hooks/use-bar-drag"
import { ActualBar, BarChips, BaselineBar, DragTooltip, SprintBands } from "./plan-bar-overlays"
import type { ChartEnv } from "./chart-types"

/** Horizontal padding of the in-bar label (px-1.5) plus the resize grip. */
const BAR_LABEL_PAD = 14

interface Props {
  /** Only dated rows have a bar (undated rows: ./plan-undated-mark.tsx). */
  item: DatedPlanItem
  kind: BarKind
  env: ChartEnv
  drag: BarDrag
  /** Live edit of this item (drag / keyboard nudge in progress), else null. */
  live: LiveEdit | null
  selected: boolean
  isTabStop: boolean
  hintId: string
  onSelect: (id: string) => void
  onOpen: (item: PlanItem) => void
  /** Pointer down on the connector ● (drag-to-link); the ● is shown only to editors. */
  onStartLink: (e: PointerEvent<HTMLElement>, id: string) => void
  /** Roving-focus navigation; returns true when the key was handled. */
  onNavigate: (e: KeyboardEvent<HTMLElement>) => boolean
}

function accessibleLabel(item: DatedPlanItem, kind: BarKind, env: ChartEnv): string {
  const status = itemBadge(env.t, item).label
  const name = env.nameOf(item)
  if (kind === "milestone") return fillTemplate(env.t.planMilestoneLabel, { name, date: formatFullDate(item.plannedEnd, env.language), status })
  const template = kind === "summary" ? env.t.planSummaryBarLabel : env.t.planBarLabel
  return fillTemplate(template, {
    name,
    start: formatFullDate(item.plannedStart, env.language),
    end: formatFullDate(item.plannedEnd, env.language),
    pct: item.progressPct,
    status,
  })
}

/**
 * One timeline row's marks: planned bar (leaf), summary bracket (parent) or
 * milestone diamond, plus actual / baseline / sprint overlays and chips.
 * Click selects, double click / Enter opens; leaves and milestones drag.
 */
export const PlanBar = memo(function PlanBar({ item, kind, env, drag, live, selected, isTabStop, hintId, onSelect, onOpen, onStartLink, onNavigate }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const draggable = env.canEdit && kind !== "summary"

  // While a (touch) drag is active the page must not scroll: needs a non-passive listener.
  useEffect(() => {
    const el = ref.current
    if (!el || !draggable) return
    const onTouchMove = (e: TouchEvent) => {
      if (drag.isDragging()) e.preventDefault()
    }
    el.addEventListener("touchmove", onTouchMove, { passive: false })
    return () => el.removeEventListener("touchmove", onTouchMove)
  }, [drag, draggable])

  const g = spanGeometry(item.plannedStart, item.plannedEnd, env.startDay, env.dayWidth)
  const center = dayCenterX(item.plannedEnd, env.startDay, env.dayWidth)
  const common = {
    ref,
    role: "button",
    tabIndex: isTabStop ? 0 : -1,
    "data-plan-bar": item.id,
    "aria-label": accessibleLabel(item, kind, env),
    "aria-describedby": hintId,
    "aria-current": selected ? ("true" as const) : undefined,
    onFocus: () => onSelect(item.id),
    onClick: () => {
      if (drag.consumeClickSuppression()) return
      ref.current?.focus()
      onSelect(item.id)
    },
    onDoubleClick: () => onOpen(item),
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (!onNavigate(e)) drag.onKeyDown(e, item, kind, onOpen)
    },
    onBlur: drag.onBlur,
    onPointerDown: (e: React.PointerEvent) => drag.onPointerDown(e, item, kind, "move"),
    onPointerMove: drag.onPointerMove,
    onPointerUp: drag.onPointerUp,
    onPointerCancel: drag.onPointerCancel,
  } as const
  const ring = selected ? "ring-2 ring-focus ring-offset-1 ring-offset-surface" : ""

  const name = env.nameOf(item)
  // On screen a bar ≥ 48px shows its (truncated) name; a printout has no hover title, so a
  // name that does not fit inside the bar is printed right of it instead.
  const labelInside = env.printing ? g.width >= estimateTextWidth(name) + BAR_LABEL_PAD : g.width >= 48
  let main: React.ReactNode
  let chipLeft = g.x + g.width
  let outsideName: string | undefined = kind === "leaf" && env.printing && !labelInside ? name : undefined
  if (kind === "milestone") {
    outsideName = name
    chipLeft = center + 10
    main = (
      <div
        {...common}
        className={cn("absolute z-[6] flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-ui-sm", milestoneClass(item), draggable ? "cursor-grab" : "cursor-pointer", ring)}
        style={{ left: center, top: ROW_LAYOUT.bar.top - 4 }}
      >
        <span aria-hidden="true" className="block h-3.5 w-3.5 rotate-45 bg-current shadow-ui-sm" />
      </div>
    )
  } else if (kind === "summary") {
    main = (
      <div {...common} className={cn("absolute z-[6] cursor-pointer rounded-ui-sm", ring)} style={{ left: g.x, width: g.width, top: ROW_LAYOUT.bar.top + 2, height: 12 }}>
        <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5 overflow-hidden rounded-sm bg-fg-subtle">
          <span className="absolute inset-y-0 left-0 bg-fg" style={{ width: `${item.progressPct}%` }} />
        </span>
        <span aria-hidden="true" className="absolute left-0 top-1.5 h-0 w-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-fg border-r-transparent border-t-fg" />
        <span aria-hidden="true" className="absolute right-0 top-1.5 h-0 w-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-fg border-t-fg" />
      </div>
    )
  } else {
    main = (
      <div
        {...common}
        className={cn("absolute z-[6] overflow-hidden rounded-ui-sm shadow-ui-sm", barFillClass(item), draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer", ring)}
        style={{ left: g.x, width: g.width, top: ROW_LAYOUT.bar.top, height: ROW_LAYOUT.bar.height }}
      >
        <span aria-hidden="true" className="absolute inset-y-0 left-0 bg-black/25" style={{ width: `${item.progressPct}%` }} />
        {labelInside && (
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center truncate px-1.5 text-caption font-medium leading-none text-white">
            {name}
          </span>
        )}
        {draggable && (
          <span
            aria-hidden="true"
            data-plan-resize={item.id}
            className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-black/10 hover:bg-black/30"
            onPointerDown={(e) => drag.onPointerDown(e, item, kind, "resize")}
          />
        )}
      </div>
    )
  }

  return (
    <>
      <ActualBar item={item} env={env} />
      <BaselineBar item={item} env={env} />
      <SprintBands item={item} env={env} />
      {main}
      {env.canEdit && !env.printing && (
        <Connector x={kind === "milestone" ? center + 12 : g.x + g.width} visible={selected} label={env.t.depPlanConnector} onPointerDown={(e) => onStartLink(e, item.id)} itemId={item.id} />
      )}
      <BarChips item={item} env={env} left={chipLeft} name={outsideName} />
      {live && <DragTooltip edit={live} env={env} x={kind === "milestone" ? center : g.x + g.width / 2} single={kind === "milestone"} />}
    </>
  )
})

/**
 * The ● right of a bar's finish: drag it onto another bar to make that bar
 * wait for this one. Shown on row hover and on the selected bar (touch).
 * Pointer-only; keyboard users use "Add successor…" in the row menu.
 */
function Connector({ x, visible, label, itemId, onPointerDown }: { x: number; visible: boolean; label: string; itemId: string; onPointerDown: (e: PointerEvent<HTMLElement>) => void }) {
  return (
    <span
      aria-hidden="true"
      data-plan-connector={itemId}
      title={label}
      onPointerDown={onPointerDown}
      className={cn(
        "absolute z-[7] flex h-5 w-5 -translate-y-1/2 cursor-crosshair touch-none items-center justify-center print:hidden",
        visible ? "opacity-100" : "opacity-0 focus-within:opacity-100 group-hover:opacity-100",
      )}
      style={{ left: x + 1, top: ROW_CENTER }}
    >
      <span className="block h-3 w-3 rounded-full border-2 border-primary bg-surface shadow-ui-sm transition-transform hover:scale-125" />
    </span>
  )
}
