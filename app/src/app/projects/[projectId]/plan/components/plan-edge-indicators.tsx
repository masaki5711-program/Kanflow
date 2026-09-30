"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import type { Translations } from "@/lib/i18n"
import { fillTemplate } from "../lib/template"

interface Props {
  t: Translations
  /** X where the visible timeline starts inside the chart wrapper (the grid width). */
  timelineLeft: number
  before: number
  after: number
  onBefore: () => void
  onAfter: () => void
}

const PILL =
  "absolute top-1/2 z-30 inline-flex -translate-y-1/2 items-center gap-0.5 rounded-full border border-border-strong bg-surface py-1 text-caption font-semibold text-fg shadow-ui-md hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus print:hidden"

/**
 * "◀ 3 件" / "▶ 5 件" pills at the edges of the visible timeline: how many
 * bars are scrolled out of view on each side. A click scrolls to the nearest one.
 */
export function PlanEdgeIndicators({ t, timelineLeft, before, after, onBefore, onAfter }: Props) {
  return (
    <>
      {before > 0 && (
        <button
          type="button"
          data-plan-offscreen="before"
          aria-label={fillTemplate(t.planOffscreenBefore, { n: before })}
          title={fillTemplate(t.planOffscreenBefore, { n: before })}
          onClick={onBefore}
          className={`${PILL} pl-1 pr-2`}
          style={{ left: timelineLeft + 8 }}
        >
          <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          {fillTemplate(t.planOffscreenCount, { n: before })}
        </button>
      )}
      {after > 0 && (
        <button
          type="button"
          data-plan-offscreen="after"
          aria-label={fillTemplate(t.planOffscreenAfter, { n: after })}
          title={fillTemplate(t.planOffscreenAfter, { n: after })}
          onClick={onAfter}
          className={`${PILL} pl-2 pr-1`}
          style={{ right: 20 }}
        >
          {fillTemplate(t.planOffscreenCount, { n: after })}
          <ChevronRight aria-hidden="true" className="h-4 w-4" />
        </button>
      )}
    </>
  )
}
