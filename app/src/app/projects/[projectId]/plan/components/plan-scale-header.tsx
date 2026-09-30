"use client"

import { memo } from "react"
import { cn } from "@/components/ui"
import { tierLabelInset, todayPillBox } from "../lib/scale-labels"
import type { TimeScale } from "../lib/scale"

export const SCALE_TOP_HEIGHT = 24
export const SCALE_BOTTOM_HEIGHT = 28
export const HEADER_HEIGHT = SCALE_TOP_HEIGHT + SCALE_BOTTOM_HEIGHT

interface Props {
  scale: TimeScale
  /** X of today's column centre (null when outside the range). */
  todayX: number | null
  dayWidth: number
  todayLabel: string
}

/**
 * Two-tier time scale (decorative: dates are announced by each bar's label).
 * The today column is tinted and labelled with the date; a month / year label
 * the pill would cover moves to just right of the pill.
 */
export const PlanScaleHeader = memo(function PlanScaleHeader({ scale, todayX, dayWidth, todayLabel }: Props) {
  const pill = todayX === null ? null : todayPillBox(todayX, todayLabel)
  return (
    <div aria-hidden="true" className="relative shrink-0 border-b border-border bg-surface-muted" style={{ width: scale.width, height: HEADER_HEIGHT }}>
      <div className="absolute inset-x-0 top-0" style={{ height: SCALE_TOP_HEIGHT }}>
        {scale.top.map((c) => (
          <div
            key={c.key}
            className="absolute top-0 flex h-full items-center overflow-hidden border-l border-border pr-2 text-caption font-semibold text-fg"
            style={{ left: c.x, width: c.width, paddingLeft: tierLabelInset(c.x, c.label, pill) }}
          >
            <span className="truncate">{c.label}</span>
          </div>
        ))}
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
            <span className="tabular-nums">{c.label}</span>
            {c.sub && <span>{c.sub}</span>}
          </div>
        ))}
      </div>
      {todayX !== null && (
        <>
          <div className="absolute bottom-0 bg-plan-today/15" style={{ left: todayX - dayWidth / 2, width: Math.max(2, dayWidth), top: SCALE_TOP_HEIGHT }} />
          <span
            data-plan-today-label=""
            className="absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-ui-sm bg-plan-today px-1.5 py-0.5 text-caption font-semibold leading-none text-white shadow-ui-sm"
            style={{ left: todayX, top: 3 }}
          >
            {todayLabel}
          </span>
        </>
      )}
    </div>
  )
})
