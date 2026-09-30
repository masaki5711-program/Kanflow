"use client"

import type { ReactNode } from "react"
import { useLanguage } from "@/lib/language-context"
import { scheduleLabel } from "../lib/status"

function Item({ swatch, children }: { swatch: ReactNode; children: ReactNode }) {
  return (
    <li className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className="inline-flex h-4 w-5 items-center justify-center">
        {swatch}
      </span>
      {children}
    </li>
  )
}

/** Legend of every mark the timeline draws (states, summary, milestone, overlays). */
export function PlanLegend() {
  const { t } = useLanguage()
  const bar = (cls: string) => <span className={`block h-2.5 w-5 rounded-sm ${cls}`} />
  return (
    <section aria-label={t.planLegendLabel}>
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-caption text-fg-muted">
        <Item swatch={bar("bg-primary-strong")}>{scheduleLabel(t, "on_track")}</Item>
        <Item swatch={bar("bg-warning")}>{scheduleLabel(t, "at_risk")}</Item>
        <Item swatch={bar("bg-danger")}>{scheduleLabel(t, "delayed")}</Item>
        <Item swatch={bar("bg-success")}>{scheduleLabel(t, "done")}</Item>
        <Item swatch={bar("bg-fg-subtle")}>{scheduleLabel(t, "not_started")}</Item>
        <Item swatch={bar("bg-fg-muted plan-hatch")}>{scheduleLabel(t, "on_hold")}</Item>
        <Item
          swatch={
            <span className="relative block h-2.5 w-5 overflow-hidden rounded-sm bg-primary-strong">
              <span className="absolute inset-y-0 left-0 w-1/2 bg-black/25" />
            </span>
          }
        >
          {t.planLegendProgress}
        </Item>
        <Item swatch={<span className="block h-1.5 w-5 rounded-sm bg-fg" />}>{t.planLegendSummary}</Item>
        <Item swatch={<span className="block h-2.5 w-2.5 rotate-45 bg-plan-milestone" />}>{t.planIsMilestone}</Item>
        <Item swatch={<span className="block h-[3px] w-5 rounded-full bg-fg-muted" />}>{t.planLegendActual}</Item>
        <Item swatch={<span className="block h-[3px] w-5 rounded-full bg-border-strong" />}>{t.planBaseline}</Item>
        <Item
          swatch={
            // Bands take one palette colour per sprint (see status.ts sprintBandClass).
            <span className="flex h-1 w-5 gap-px">
              <span className="block h-full flex-1 rounded-full bg-chart-1" />
              <span className="block h-full flex-1 rounded-full bg-chart-2" />
              <span className="block h-full flex-1 rounded-full bg-chart-3" />
            </span>
          }
        >
          {t.planLegendSprint}
        </Item>
        <Item
          swatch={
            <svg viewBox="0 0 20 10" className="h-3 w-5">
              <path d="M1 2 H8 V8 H17" fill="none" strokeWidth="1.5" className="stroke-fg-muted" />
              <path d="M15 5.5 L19 8 L15 10.5 z" className="fill-fg-muted" />
            </svg>
          }
        >
          {t.planDependencies}
        </Item>
        <Item
          swatch={
            <svg viewBox="0 0 20 10" className="h-3 w-5">
              <path d="M1 2 H8 V8 H17" fill="none" strokeWidth="1.5" strokeDasharray="3 2" className="stroke-warning" />
            </svg>
          }
        >
          {t.planDependencyViolated}
        </Item>
        <Item swatch={<span className="block h-4 w-0.5 bg-plan-today" />}>{t.planToday}</Item>
      </ul>
    </section>
  )
}
