"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import type { Translations } from "@/lib/i18n"
import { fillTemplate } from "../lib/template"
import { SCALE_BOTTOM_HEIGHT, SCALE_TOP_HEIGHT } from "./plan-scale-header"

interface Props {
  t: Translations
  /** X where the visible timeline starts inside the chart wrapper (the grid width). */
  timelineLeft: number
  before: number
  after: number
  onBefore: () => void
  onAfter: () => void
  /** Side of the visible timeline today lies beyond (null = today is visible). */
  todaySide: "before" | "after" | null
  /** Today's date as shown in the scale header ("09/30(水)"). */
  todayDate: string
  onToday: () => void
}

const PILL_HEIGHT = 22
/** Inside the scale header's lower tier (the chart box has a 1px border), clear of every bar label. */
const PILL_TOP = 1 + SCALE_TOP_HEIGHT + (SCALE_BOTTOM_HEIGHT - PILL_HEIGHT) / 2
/** Right inset: clear of the chart's vertical scrollbar. */
const RIGHT_INSET = 20

const BASE =
  "pointer-events-auto inline-flex shrink-0 items-center gap-0.5 rounded-full text-caption font-semibold leading-none shadow-ui-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
/** Count pills: neutral surface. */
const COUNT = `${BASE} border border-border-strong bg-surface/95 text-fg hover:bg-surface-muted`
/** Today pill: the today colour, so it never reads as an item count. */
const TODAY = `${BASE} bg-plan-today text-white hover:brightness-110`

/**
 * Hints in the scale header band at the edges of the visible timeline:
 * "◀ 3 件" / "5 件 ▶" (bars scrolled out of view; click → nearest one) and
 * "◀ 今日" / "今日 ▶" when today is off-screen (click → today).
 */
export function PlanEdgeIndicators({ t, timelineLeft, before, after, onBefore, onAfter, todaySide, todayDate, onToday }: Props) {
  const todayHint = fillTemplate(todaySide === "before" ? t.planTodayOffscreenBefore : t.planTodayOffscreenAfter, { date: todayDate })
  const todayPill = (side: "before" | "after") =>
    todaySide === side && (
      <button type="button" data-plan-today-pill={side} aria-label={todayHint} title={todayHint} onClick={onToday} className={`${TODAY} ${side === "before" ? "pl-1 pr-2" : "pl-2 pr-1"}`} style={{ height: PILL_HEIGHT }}>
        {side === "before" && <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" />}
        {t.planToday}
        {side === "after" && <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />}
      </button>
    )
  const row = "pointer-events-none absolute z-30 flex items-center gap-1 print:hidden"
  return (
    <>
      <div className={row} style={{ top: PILL_TOP, left: timelineLeft + 6 }}>
        {todayPill("before")}
        {before > 0 && (
          <button
            type="button"
            data-plan-offscreen="before"
            aria-label={fillTemplate(t.planOffscreenBefore, { n: before })}
            title={fillTemplate(t.planOffscreenBefore, { n: before })}
            onClick={onBefore}
            className={`${COUNT} pl-1 pr-2`}
            style={{ height: PILL_HEIGHT }}
          >
            <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" />
            {fillTemplate(t.planOffscreenCount, { n: before })}
          </button>
        )}
      </div>
      <div className={row} style={{ top: PILL_TOP, right: RIGHT_INSET }}>
        {after > 0 && (
          <button
            type="button"
            data-plan-offscreen="after"
            aria-label={fillTemplate(t.planOffscreenAfter, { n: after })}
            title={fillTemplate(t.planOffscreenAfter, { n: after })}
            onClick={onAfter}
            className={`${COUNT} pl-2 pr-1`}
            style={{ height: PILL_HEIGHT }}
          >
            {fillTemplate(t.planOffscreenCount, { n: after })}
            <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        )}
        {todayPill("after")}
      </div>
    </>
  )
}
