"use client"

import { memo } from "react"
import { cn } from "@/components/ui"
import { TIER_LABEL_INSET, labelFits, tierLabelInset, todayPillBox } from "../lib/scale-labels"
import type { TimeScale } from "../lib/scale"

export const SCALE_TOP_HEIGHT = 24
export const SCALE_BOTTOM_HEIGHT = 28
export const HEADER_HEIGHT = SCALE_TOP_HEIGHT + SCALE_BOTTOM_HEIGHT

/** Horizontal padding of a lower-tier label (px-1.5) plus a little air. */
const BOTTOM_LABEL_PAD = 14

interface Props {
  scale: TimeScale
  /** X of today's column centre (null when outside the range). */
  todayX: number | null
  /** Centre of the today pill: todayX, clamped inside the visible timeline (see clampPillX). */
  pillX: number | null
  dayWidth: number
  todayLabel: string
  /** Left offset of the timeline in the scroll box (the sticky grid): top-tier labels stick right of it. */
  stickyLeft: number
}

/**
 * Two-tier time scale (decorative: dates are announced by each bar's label).
 * The today column is tinted and labelled with the date; a month / year label
 * the pill would cover moves to just right of the pill. Top-tier labels are
 * sticky (the current year / month stays readable at the left edge), and a
 * label that does not fit its cell is left out instead of wrapping (print).
 */
export const PlanScaleHeader = memo(function PlanScaleHeader({ scale, todayX, pillX, dayWidth, todayLabel, stickyLeft }: Props) {
  const pill = pillX === null ? null : todayPillBox(pillX, todayLabel)
  return (
    <div aria-hidden="true" className="relative shrink-0 border-b border-border bg-surface-muted" style={{ width: scale.width, height: HEADER_HEIGHT }}>
      <div className="absolute inset-x-0 top-0" style={{ height: SCALE_TOP_HEIGHT }}>
        {scale.top.map((c) => {
          const inset = tierLabelInset(c.x, c.label, pill)
          return (
            <div
              key={c.key}
              className="absolute top-0 flex h-full items-center overflow-clip border-l border-border pr-2 text-caption font-semibold text-fg"
              style={{ left: c.x, width: c.width, paddingLeft: inset }}
            >
              {labelFits(c.width, c.label, TIER_LABEL_INSET * 2) && (
                <span
                  data-plan-tier-label=""
                  className="sticky truncate"
                  style={{ left: stickyLeft + TIER_LABEL_INSET, maxWidth: Math.max(0, c.width - inset - TIER_LABEL_INSET) }}
                >
                  {c.label}
                </span>
              )}
            </div>
          )
        })}
      </div>
      <div className="absolute inset-x-0 border-t border-border" style={{ top: SCALE_TOP_HEIGHT, height: SCALE_BOTTOM_HEIGHT }}>
        {scale.bottom.map((c) => (
          <div
            key={c.key}
            className={cn(
              "absolute top-0 flex h-full flex-col justify-center overflow-hidden border-l border-border/70 text-caption leading-none text-fg-muted",
              c.weekend && "bg-surface-sunken",
              c.sub ? "items-center gap-0.5" : "items-start px-1.5",
            )}
            style={{ left: c.x, width: c.width }}
          >
            {labelFits(c.width, c.label, c.sub ? 2 : BOTTOM_LABEL_PAD) && (
              <>
                <span className="whitespace-nowrap tabular-nums">{c.label}</span>
                {c.sub && <span>{c.sub}</span>}
              </>
            )}
          </div>
        ))}
      </div>
      {todayX !== null && (
        <div className="absolute bottom-0 bg-plan-today/15" style={{ left: todayX - dayWidth / 2, width: Math.max(2, dayWidth), top: SCALE_TOP_HEIGHT }} />
      )}
      {pillX !== null && (
        <span
          data-plan-today-label=""
          className="absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-ui-sm bg-plan-today px-1.5 py-0.5 text-caption font-semibold leading-none text-white shadow-ui-sm"
          style={{ left: pillX, top: 3 }}
        >
          {todayLabel}
        </span>
      )}
    </div>
  )
})
