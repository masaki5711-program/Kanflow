"use client"

import { memo, useEffect, useRef, type KeyboardEvent } from "react"
import { cn } from "@/components/ui"
import { formatFullDate } from "../lib/date-format"
import { ROW_LAYOUT, dayCenterX, spanGeometry } from "../lib/geometry"
import type { BarKind } from "../lib/interaction"
import type { PlanItem } from "../lib/plan-types"
import { barFillClass, itemBadge, milestoneClass } from "../lib/status"
import { fillTemplate } from "../lib/template"
import type { BarDrag, LiveEdit } from "../hooks/use-bar-drag"
import { ActualBar, BarChips, BaselineBar, DragTooltip, SprintBands } from "./plan-bar-overlays"
import type { ChartEnv } from "./chart-types"

interface Props {
  item: PlanItem
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
  /** Roving-focus navigation; returns true when the key was handled. */
  onNavigate: (e: KeyboardEvent<HTMLElement>) => boolean
}

function accessibleLabel(item: PlanItem, kind: BarKind, env: ChartEnv): string {
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
export const PlanBar = memo(function PlanBar({ item, kind, env, drag, live, selected, isTabStop, hintId, onSelect, onOpen, onNavigate }: Props) {
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

  let main: React.ReactNode
  let chipLeft = g.x + g.width
  if (kind === "milestone") {
    chipLeft = center + 10
    main = (
      <div
        {...common}
        className={cn("absolute flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-ui-sm", milestoneClass(item), draggable ? "cursor-grab" : "cursor-pointer", ring)}
        style={{ left: center, top: ROW_LAYOUT.bar.top - 4 }}
      >
        <span aria-hidden="true" className="block h-3.5 w-3.5 rotate-45 bg-current shadow-ui-sm" />
      </div>
    )
  } else if (kind === "summary") {
    main = (
      <div {...common} className={cn("absolute cursor-pointer rounded-ui-sm", ring)} style={{ left: g.x, width: g.width, top: ROW_LAYOUT.bar.top + 2, height: 12 }}>
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
        className={cn("absolute overflow-hidden rounded-ui-sm shadow-ui-sm", barFillClass(item), draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer", ring)}
        style={{ left: g.x, width: g.width, top: ROW_LAYOUT.bar.top, height: ROW_LAYOUT.bar.height }}
      >
        <span aria-hidden="true" className="absolute inset-y-0 left-0 bg-black/25" style={{ width: `${item.progressPct}%` }} />
        {g.width >= 48 && (
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center truncate px-1.5 text-caption font-medium leading-none text-white">
            {env.nameOf(item)}
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
      <BarChips item={item} env={env} left={chipLeft} name={kind === "milestone" ? env.nameOf(item) : undefined} />
      {live && <DragTooltip edit={live} env={env} x={kind === "milestone" ? center : g.x + g.width / 2} />}
    </>
  )
})
