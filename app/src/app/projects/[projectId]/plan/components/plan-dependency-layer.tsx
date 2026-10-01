"use client"

import { memo, useId } from "react"
import { cn } from "@/components/ui"
import type { DependencyArrow } from "../lib/geometry"

interface Props {
  arrows: readonly DependencyArrow[]
  width: number
  height: number
  /**
   * Dependency chain of the selected item (null = nothing selected / no
   * dependencies): its arrows are emphasised, the others fade.
   */
  chain: ReadonlySet<string> | null
  violatedLabel: string
}

const inChain = (a: DependencyArrow, chain: ReadonlySet<string>) => chain.has(a.predecessorId) && chain.has(a.successorId)

/**
 * Finish-to-start arrows (SVG, under the bars). Violations use the warning
 * colour and a dashed stroke so the state is not conveyed by colour alone.
 */
export const PlanDependencyLayer = memo(function PlanDependencyLayer({ arrows, width, height, chain, violatedLabel }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "")
  if (arrows.length === 0) return null
  const ok = `plan-arrow-ok-${uid}`
  const bad = `plan-arrow-bad-${uid}`
  const hot = `plan-arrow-hot-${uid}`
  return (
    <svg aria-hidden="true" data-plan-arrows="" className="pointer-events-none absolute left-0 top-0 overflow-visible" width={width} height={height}>
      <defs>
        <marker id={ok} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L8 4 L0 8 z" className="fill-fg-muted" />
        </marker>
        <marker id={hot} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L8 4 L0 8 z" className="fill-primary-strong" />
        </marker>
        <marker id={bad} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L8 4 L0 8 z" className="fill-warning" />
        </marker>
      </defs>
      {arrows.map((a) => {
        const active = chain !== null && inChain(a, chain)
        const faded = chain !== null && !active
        return (
          <path
            key={a.id}
            d={a.d}
            data-plan-arrow={a.id}
            data-violated={a.violated ? "true" : undefined}
            data-chain={active ? "true" : undefined}
            fill="none"
            strokeWidth={active ? 2.25 : 1.5}
            strokeDasharray={a.violated ? "4 3" : undefined}
            markerEnd={`url(#${a.violated ? bad : active ? hot : ok})`}
            opacity={faded ? 0.3 : 1}
            className={cn(a.violated ? "stroke-warning" : active ? "stroke-primary-strong" : "stroke-fg-muted")}
          >
            {a.violated && <title>{violatedLabel}</title>}
          </path>
        )
      })}
    </svg>
  )
})

interface HitProps {
  arrows: readonly DependencyArrow[]
  width: number
  height: number
  titleOf: (arrow: DependencyArrow) => string
  onPick: (arrow: DependencyArrow) => void
}

/**
 * Invisible, wide strokes over the bars so an arrow can be clicked (remove).
 * Only the strokes take pointer events; the rest of the layer lets clicks
 * through to the bars. Keyboard users remove links in the item editor.
 */
export const PlanDependencyHitLayer = memo(function PlanDependencyHitLayer({ arrows, width, height, titleOf, onPick }: HitProps) {
  if (arrows.length === 0) return null
  return (
    <svg aria-hidden="true" data-plan-arrow-hits="" className="pointer-events-none absolute left-0 top-0 overflow-visible" width={width} height={height}>
      {arrows.map((a) => (
        <path
          key={a.id}
          d={a.d}
          data-plan-arrow-hit={a.id}
          fill="none"
          strokeWidth={9}
          className="cursor-pointer stroke-transparent hover:stroke-primary/25"
          style={{ pointerEvents: "stroke" }}
          onClick={() => onPick(a)}
        >
          <title>{titleOf(a)}</title>
        </path>
      ))}
    </svg>
  )
})
