"use client"

import { memo, useId } from "react"
import { cn } from "@/components/ui"
import type { DependencyArrow } from "../lib/geometry"

interface Props {
  arrows: readonly DependencyArrow[]
  width: number
  height: number
  /** Arrows touching this item are emphasised. */
  selectedId: string | null
  violatedLabel: string
}

/**
 * Finish-to-start arrows (SVG, under the bars). Violations use the warning
 * colour and a dashed stroke so the state is not conveyed by colour alone.
 */
export const PlanDependencyLayer = memo(function PlanDependencyLayer({ arrows, width, height, selectedId, violatedLabel }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "")
  if (arrows.length === 0) return null
  const ok = `plan-arrow-ok-${uid}`
  const bad = `plan-arrow-bad-${uid}`
  return (
    <svg aria-hidden="true" data-plan-arrows="" className="pointer-events-none absolute left-0 top-0 overflow-visible" width={width} height={height}>
      <defs>
        <marker id={ok} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L8 4 L0 8 z" className="fill-fg-muted" />
        </marker>
        <marker id={bad} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L8 4 L0 8 z" className="fill-warning" />
        </marker>
      </defs>
      {arrows.map((a) => {
        const active = selectedId !== null && (a.predecessorId === selectedId || a.successorId === selectedId)
        return (
          <path
            key={a.id}
            d={a.d}
            data-plan-arrow={a.id}
            data-violated={a.violated ? "true" : undefined}
            fill="none"
            strokeWidth={active ? 2.25 : 1.5}
            strokeDasharray={a.violated ? "4 3" : undefined}
            markerEnd={`url(#${a.violated ? bad : ok})`}
            className={cn(a.violated ? "stroke-warning" : active ? "stroke-fg" : "stroke-fg-muted")}
          >
            {a.violated && <title>{violatedLabel}</title>}
          </path>
        )
      })}
    </svg>
  )
})
