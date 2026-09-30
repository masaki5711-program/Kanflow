"use client"

import { useMemo, type ReactNode, type RefObject } from "react"
import type { Translations } from "@/lib/i18n"
import type { FlatRow } from "../lib/tree"
import { itemSpans, offscreenSummary, revealScrollLeft, type RowSpan } from "../lib/viewport"
import type { TimelineViewport } from "../hooks/use-timeline-viewport"
import { PlanEdgeIndicators } from "./plan-edge-indicators"
import { PlanSplitter } from "./plan-splitter"

interface Props {
  t: Translations
  scrollRef: RefObject<HTMLDivElement | null>
  viewport: TimelineViewport
  rows: readonly FlatRow[]
  startDay: number
  dayWidth: number
  gridWidth: number
  nameWidth: number
  nameBounds: { min: number; max: number }
  onNameWidth: (width: number) => void
  /** Print layout: no splitter / indicators. */
  printing: boolean
  children: ReactNode
}

/**
 * The chart plus what floats over it: the grid / timeline splitter and the
 * off-screen indicators ("◀ 3 件" / "▶ 5 件") at the edges of the visible timeline.
 */
export function PlanChartFrame(props: Props) {
  const { t, scrollRef, viewport, rows, startDay, dayWidth, gridWidth, printing } = props
  const spans = useMemo(() => itemSpans(rows.map((r) => r.item), startDay, dayWidth), [rows, startDay, dayWidth])
  const visibleWidth = Math.max(0, viewport.clientWidth - gridWidth)
  const measured = viewport.clientWidth > 0 && !printing
  const off = offscreenSummary(spans, viewport.scrollLeft, viewport.scrollLeft + visibleWidth)

  const reveal = (span: RowSpan | null) => {
    const el = scrollRef.current
    if (!el || !span) return
    const left = revealScrollLeft(span, visibleWidth)
    if (typeof el.scrollTo === "function") el.scrollTo({ left, behavior: "smooth" })
    else el.scrollLeft = left
  }

  return (
    <div className="relative">
      {props.children}
      {!printing && (
        <PlanSplitter
          left={gridWidth + 1}
          value={props.nameWidth}
          min={props.nameBounds.min}
          max={props.nameBounds.max}
          onChange={props.onNameWidth}
          label={t.planSplitterLabel}
          hint={t.planSplitterHint}
        />
      )}
      {measured && (
        <PlanEdgeIndicators
          t={t}
          timelineLeft={gridWidth + 1}
          before={off.before}
          after={off.after}
          onBefore={() => reveal(off.nearestBefore)}
          onAfter={() => reveal(off.nearestAfter)}
        />
      )}
    </div>
  )
}
