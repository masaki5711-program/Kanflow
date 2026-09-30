/**
 * Status / schedule-state presentation. Bar fills carry white 12px labels,
 * so every fill keeps >= 4.5:1 against #fff (kit tokens):
 *   on_track primary-strong 6.7 · at_risk warning 5.0 · delayed danger 4.8 ·
 *   done success 5.0 · not_started fg-subtle 5.7 · on_hold fg-muted 7.6
 */
import type { BadgeTone } from "@/components/ui"
import type { Translations } from "@/lib/i18n"
import type { PlanItem, PlanStatus, ScheduleState } from "./plan-types"

export function statusLabel(t: Translations, status: PlanStatus): string {
  switch (status) {
    case "in_progress":
      return t.planStatusInProgress
    case "done":
      return t.planStatusDone
    case "on_hold":
      return t.planStatusOnHold
    default:
      return t.planStatusNotStarted
  }
}

export function scheduleLabel(t: Translations, state: ScheduleState): string {
  switch (state) {
    case "done":
      return t.planStatusDone
    case "delayed":
      return t.planStatusDelayed
    case "at_risk":
      return t.planScheduleAtRisk
    case "on_track":
      return t.planScheduleOnTrack
    case "on_hold":
      return t.planStatusOnHold
    default:
      return t.planStatusNotStarted
  }
}

const TONE: Record<ScheduleState, BadgeTone> = {
  done: "success",
  delayed: "danger",
  at_risk: "warning",
  on_track: "primary",
  not_started: "neutral",
  on_hold: "neutral",
}

const FILL: Record<ScheduleState, string> = {
  done: "bg-success",
  delayed: "bg-danger",
  at_risk: "bg-warning",
  on_track: "bg-primary-strong",
  not_started: "bg-fg-subtle",
  on_hold: "bg-fg-muted plan-hatch",
}

/** A paused item reads as on_hold whatever state an older backend computed. */
const effectiveState = (item: Pick<PlanItem, "status" | "scheduleState">): ScheduleState => (item.status === "on_hold" ? "on_hold" : item.scheduleState)

/** Badge shown in the grid: the schedule state ("on hold" for paused items). */
export function itemBadge(t: Translations, item: PlanItem): { label: string; tone: BadgeTone } {
  const state = effectiveState(item)
  return { label: scheduleLabel(t, state), tone: TONE[state] }
}

export function barFillClass(item: Pick<PlanItem, "status" | "scheduleState">): string {
  return FILL[effectiveState(item)]
}

/** Milestone diamond colour (text-* so it can use currentColor). */
export function milestoneClass(item: Pick<PlanItem, "scheduleState">): string {
  if (item.scheduleState === "done") return "text-success"
  if (item.scheduleState === "delayed") return "text-danger"
  if (item.scheduleState === "at_risk") return "text-warning"
  if (item.scheduleState === "on_hold") return "text-fg-muted"
  return "text-plan-milestone"
}

/** Sprint band colours (chart palette, stable per sprint id). */
const SPRINT_FILLS = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-6", "bg-chart-5"]
export function sprintBandClass(sprintId: string): string {
  let h = 0
  for (let i = 0; i < sprintId.length; i++) h = (h * 31 + sprintId.charCodeAt(i)) >>> 0
  return SPRINT_FILLS[h % SPRINT_FILLS.length]
}
