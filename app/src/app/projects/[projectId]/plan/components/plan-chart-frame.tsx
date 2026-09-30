"use client"

import { useMemo, type ReactNode, type RefObject } from "react"
import type { Translations } from "@/lib/i18n"
import type { FlatRow } from "../lib/tree"
import { itemSpans, offscreenSummary, revealScrollLeft, todaySide, type RowSpan } from "../lib/viewport"
import { scrollLeftFor } from "../hooks/use-plan-scroll"
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
  /** Show the splitter (off in the phone "names first" layout). */
  splitter: boolean
  /** Today's x on the timeline and its short date (the off-screen "今日" pill). */
  today: { x: number; label: string }
  /** Print layout: no splitter / indicators. */
  printing: boolean
  children: ReactNode
}

/**
 * The chart plus what floats over it: the grid / timeline splitter and the
 * off-screen hints ("◀ 3 件" / "5 件 ▶", "今日 ▶") at the edges of the visible timeline.
 */
export function PlanChartFrame(props: Props) {
  const { t, scrollRef, viewport, rows, startDay, dayWidth, gridWidth, printing } = props
  const spans = useMemo(() => itemSpans(rows.map((r) => r.item), startDay, dayWidth), [rows, startDay, dayWidth])
  const visibleWidth = Math.max(0, viewport.clientWidth - gridWidth)
  const measured = viewport.clientWidth > 0 && !printing
  const off = offscreenSummary(spans, viewport.scrollLeft, viewport.scrollLeft + visibleWidth)

  const scrollTo = (left: number) => {
    const el = scrollRef.current
    if (!el) return
    if (typeof el.scrollTo === "function") el.scrollTo({ left, behavior: "smooth" })
    else el.scrollLeft = left
  }
  const reveal = (span: RowSpan | null) => {
    if (span) scrollTo(revealScrollLeft(span, visibleWidth))
  }

  return (
    <div className="relative">
      {props.children}
      {!printing && props.splitter && (
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
          todaySide={todaySide(props.today.x, viewport.scrollLeft, viewport.scrollLeft + visibleWidth)}
          todayDate={props.today.label}
          onToday={() => scrollTo(scrollLeftFor(props.today.x, viewport.clientWidth, gridWidth))}
        />
      )}
    </div>
  )
}
