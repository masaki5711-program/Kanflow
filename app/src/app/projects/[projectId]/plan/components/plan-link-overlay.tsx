"use client"

import { cn } from "@/components/ui"
import { ROW_CENTER, ROW_HEIGHT, itemAnchors } from "../lib/geometry"
import type { PlanItem } from "../lib/plan-types"
import { fillTemplate } from "../lib/template"
import type { LinkDrag } from "../hooks/use-link-drag"
import type { ChartEnv } from "./chart-types"

/** Widest hint pill (px) and its offset from the pointer. */
const PILL_MAX = 320
const PILL_OFFSET = 14

interface Props {
  link: LinkDrag
  byId: ReadonlyMap<string, PlanItem>
  rowIndex: ReadonlyMap<string, number>
  env: ChartEnv
  width: number
  height: number
  /** Visible timeline window (timeline px; null while printing): the pill is kept inside it. */
  view: { left: number; width: number } | null
}

/**
 * Feedback while dragging a new dependency: a dashed line from the source's
 * finish to the pointer, the target row tinted (green = can follow, amber =
 * cannot) and a pill saying what will happen on release.
 */
export function PlanLinkOverlay({ link, byId, rowIndex, env, width, height, view }: Props) {
  const { t } = env
  const source = byId.get(link.sourceId)
  const sourceRow = rowIndex.get(link.sourceId)
  // The connector ● only exists on dated bars; an undated source has no anchor.
  const anchor = source ? itemAnchors(source, env.startDay, env.dayWidth) : null
  if (!anchor || sourceRow === undefined) return null
  const from = { x: anchor.endX, y: sourceRow * ROW_HEIGHT + ROW_CENTER }
  const target = link.targetId ? byId.get(link.targetId) : undefined
  const targetRow = link.targetId ? rowIndex.get(link.targetId) : undefined
  const blocked = link.block !== null
  const reasons = { cycle: t.planSuccessorBlockedCycle, hierarchy: t.planSuccessorBlockedHierarchy, existing: t.planSuccessorBlockedExisting }
  // The pill stays inside the visible timeline window (else the scroll box / sticky grid would cut it off).
  const winLeft = view ? view.left : 0
  const winWidth = view ? view.width : width
  const pillMax = Math.max(120, Math.min(PILL_MAX, winWidth - 8))
  const pillLeft = Math.min(Math.max(link.x + PILL_OFFSET, winLeft + 4), winLeft + winWidth - pillMax - 4)
  const message = !target
    ? t.depPlanDragHint
    : link.block
      ? reasons[link.block]
      : fillTemplate(t.depPlanDropHere, { to: env.nameOf(target) })

  return (
    <div aria-hidden="true" data-plan-link-overlay="" className="pointer-events-none absolute left-0 top-0" style={{ width, height }}>
      {targetRow !== undefined && (
        <div
          data-plan-link-target={link.targetId ?? undefined}
          data-blocked={blocked ? "true" : undefined}
          className={cn("absolute inset-x-0 border-y-2", blocked ? "border-warning bg-warning/10" : "border-success bg-success/10")}
          style={{ top: targetRow * ROW_HEIGHT, height: ROW_HEIGHT }}
        />
      )}
      <svg className="absolute left-0 top-0 overflow-visible" width={width} height={height}>
        <line x1={from.x} y1={from.y} x2={link.x} y2={link.y} strokeWidth={2} strokeDasharray="5 4" className={blocked ? "stroke-warning" : "stroke-primary"} />
        <circle cx={from.x + 11} cy={from.y} r={5} className="fill-primary" />
      </svg>
      <div
        className={cn(
          "absolute truncate whitespace-nowrap rounded-ui-sm px-2 py-1 text-caption font-medium shadow-ui-md",
          blocked ? "bg-warning-soft text-warning-strong ring-1 ring-warning" : target ? "bg-primary-strong text-white" : "bg-fg text-white",
        )}
        style={{ left: pillLeft, top: link.y + 12, maxWidth: pillMax }}
      >
        {message}
      </div>
    </div>
  )
}
