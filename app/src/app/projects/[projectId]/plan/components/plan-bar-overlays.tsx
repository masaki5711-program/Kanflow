"use client"

import { formatShortDate } from "../lib/date-format"
import { spanDays, ymdToDay } from "../lib/date"
import { ROW_LAYOUT, spanGeometry } from "../lib/geometry"
import type { PlanItem } from "../lib/plan-types"
import { sprintBandClass } from "../lib/status"
import { fillTemplate as fill } from "../lib/template"
import type { LiveEdit } from "../hooks/use-bar-drag"
import type { ChartEnv } from "./chart-types"


/** Thin actual-range bar above the planned bar (open-ended actuals run to today). */
export function ActualBar({ item, env }: { item: PlanItem; env: ChartEnv }) {
  if (!item.actualStart) return null
  const end = item.actualEnd ?? (ymdToDay(env.today) >= ymdToDay(item.actualStart) ? env.today : item.actualStart)
  const g = spanGeometry(item.actualStart, end, env.startDay, env.dayWidth)
  const range = `${formatShortDate(item.actualStart, env.language)} → ${item.actualEnd ? formatShortDate(item.actualEnd, env.language) : "…"}`
  return (
    <div
      aria-hidden="true"
      data-plan-actual={item.id}
      className="absolute rounded-full bg-fg-muted"
      style={{ left: g.x, width: g.width, top: ROW_LAYOUT.actual.top, height: ROW_LAYOUT.actual.height }}
      title={`${env.t.planLegendActual}: ${range}`}
    />
  )
}

/** Baseline (saved plan) as a thin grey bar under the planned bar. */
export function BaselineBar({ item, env }: { item: PlanItem; env: ChartEnv }) {
  if (!item.baselineStart || !item.baselineEnd) return null
  const g = spanGeometry(item.baselineStart, item.baselineEnd, env.startDay, env.dayWidth)
  return (
    <div
      aria-hidden="true"
      data-plan-baseline={item.id}
      className="absolute rounded-full bg-border-strong"
      style={{ left: g.x, width: g.width, top: ROW_LAYOUT.baseline.top, height: ROW_LAYOUT.baseline.height }}
      title={`${env.t.planBaseline}: ${formatShortDate(item.baselineStart, env.language)} → ${formatShortDate(item.baselineEnd, env.language)}`}
    />
  )
}

/** Sprint bands of the linked PBIs (one thin segment per sprint). */
export function SprintBands({ item, env }: { item: PlanItem; env: ChartEnv }) {
  const sprints = item.linked?.sprints ?? []
  return (
    <>
      {sprints.map((s) => {
        const g = spanGeometry(s.startDate, s.endDate, env.startDay, env.dayWidth)
        const label = fill(env.t.planSprintBand, {
          name: s.name,
          start: formatShortDate(s.startDate, env.language),
          end: formatShortDate(s.endDate, env.language),
        })
        return (
          <div
            key={s.id}
            data-plan-sprint={s.id}
            aria-hidden="true"
            className={`absolute rounded-full ${sprintBandClass(s.id)}`}
            style={{ left: g.x + 1, width: Math.max(2, g.width - 2), top: ROW_LAYOUT.sprint.top, height: ROW_LAYOUT.sprint.height }}
            title={label}
          />
        )
      })}
    </>
  )
}

/** Chips right of the bar: milestone name, "PBI 3/5", "+3日". */
export function BarChips({ item, env, left, name }: { item: PlanItem; env: ChartEnv; left: number; name?: string }) {
  const { t } = env
  const variance = item.baselineVarianceDays ?? 0
  if (!name && !item.linked && variance <= 0) return null
  return (
    <div className="pointer-events-none absolute flex items-center gap-1 whitespace-nowrap" style={{ left: left + 6, top: ROW_LAYOUT.bar.top - 2 }}>
      {name && <span className="text-caption font-medium text-fg">{name}</span>}
      {item.linked && item.linked.pbiCount > 0 && (
        <span
          className="rounded-full bg-surface-sunken px-1.5 text-caption leading-5 text-fg-muted ring-1 ring-inset ring-border"
          title={fill(t.planLinkedChipLabel, { done: item.linked.pbiDone, total: item.linked.pbiCount })}
        >
          {fill(t.planLinkedChip, { done: item.linked.pbiDone, total: item.linked.pbiCount })}
        </span>
      )}
      {variance > 0 && (
        <span className="rounded-full bg-danger-soft px-1.5 text-caption font-medium leading-5 text-danger-strong" title={fill(t.planVarianceLabel, { n: variance })}>
          {fill(t.planVarianceChip, { n: variance })}
        </span>
      )}
    </div>
  )
}

/** Live "10/03(金) → 10/12(日) 10日" tooltip while dragging / nudging. */
export function DragTooltip({ edit, env, x }: { edit: LiveEdit; env: ChartEnv; x: number }) {
  const days = fill(env.t.planDaysCount, { n: spanDays(edit.start, edit.end) })
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-30 -translate-x-1/2 whitespace-nowrap rounded-ui-sm bg-fg px-2 py-1 text-caption font-medium text-white shadow-ui-md"
      style={{ left: x, bottom: `calc(100% - ${ROW_LAYOUT.bar.top - 4}px)` }}
    >
      {formatShortDate(edit.start, env.language)} → {formatShortDate(edit.end, env.language)} <span className="tabular-nums">{days}</span>
    </div>
  )
}
