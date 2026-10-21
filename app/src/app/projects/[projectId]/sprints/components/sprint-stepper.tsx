"use client"

import { useLanguage } from "@/lib/language-context"
import { cn } from "@/components/ui"
import { sprintTime, type SprintTime } from "../lib/sprint-metrics"
import type { Sprint } from "./types"
import { Check, Hourglass } from "lucide-react"

const STEPS = ["planning", "active", "review", "done"] as const

/** archived is a finished sprint: it sits on the last step. */
function stepIndex(status: string): number {
  return STEPS.indexOf((status === "archived" ? "done" : status) as (typeof STEPS)[number])
}

function timeText(time: SprintTime, t: ReturnType<typeof useLanguage>["t"]): string {
  switch (time.kind) {
    case "startsIn": return t.sprintUxStartsIn.replace("{n}", String(time.days))
    case "daysLeft": return t.sprintUxDaysLeft.replace("{n}", String(time.days))
    case "lastDay": return t.sprintUxLastDay
    case "over": return t.sprintUxPeriodOver
  }
}

/**
 * Where the sprint is in its life (planning → running → review → done) plus how
 * long is left. Past steps are checked, the current one is filled; the labels
 * make the order readable without colour. Finished sprints show the steps only.
 */
export default function SprintStepper({ sprint }: { sprint: Pick<Sprint, "status" | "startDate" | "endDate"> }) {
  const { t } = useLanguage()
  const labels = [t.sprintStatusPlanning, t.sprintStatusActive, t.sprintStatusReview, t.sprintStatusDone]
  const current = stepIndex(sprint.status)
  const finished = sprint.status === "done" || sprint.status === "archived"
  const time = finished ? null : sprintTime(sprint)
  const urgent = time?.kind === "lastDay" || time?.kind === "over"

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 pb-3">
      <ol aria-label={t.sprintUxStepperLabel} className="flex flex-wrap items-center gap-1.5">
        {STEPS.map((step, i) => {
          const isPast = i < current
          const isCurrent = i === current
          return (
            <li key={step} aria-current={isCurrent ? "step" : undefined}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-caption",
                isCurrent && "border-primary bg-primary text-primary-fg font-semibold",
                isPast && "border-success/30 bg-success-soft text-success-strong",
                !isCurrent && !isPast && "border-border text-fg-subtle",
              )}>
              {isPast && <Check className="h-3 w-3" aria-hidden="true" />}
              {labels[i]}
            </li>
          )
        })}
      </ol>
      {time && (
        <span className={cn("inline-flex items-center gap-1 text-body font-medium", urgent ? "text-danger" : "text-fg-muted")}>
          <Hourglass className="h-4 w-4" aria-hidden="true" />
          {timeText(time, t)}
        </span>
      )}
    </div>
  )
}
