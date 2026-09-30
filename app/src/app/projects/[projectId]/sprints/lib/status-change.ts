/**
 * Pure texts of sprint status changes (A3-10): the start confirmation summary
 * and the success toast of every transition.
 */
import type { Language, Translations } from "@/lib/i18n"
import { formatDateRange } from "@/lib/format-date"
import { fillTemplate } from "@/lib/fill-template"
import type { Sprint } from "../components/types"
import { computeSprintMetrics } from "./sprint-metrics"

/** planning → active is a "start" (asks first, notifies the team); other → active is a reopen. */
export function isSprintStart(current: string, next: string): boolean {
  return current === "planning" && next === "active"
}

/** Body of the start confirmation: period, PBI / task counts, load vs capacity (+ warnings). */
export function sprintStartMessage(sprint: Sprint, t: Translations, language: Language): string {
  const m = computeSprintMetrics(sprint)
  const pbis = new Set(sprint.items.map((i) => i.pbItem.id)).size
  const body = fillTemplate(t.sprintStartConfirmBody, {
    period: formatDateRange(sprint.startDate, sprint.endDate, language),
    pbis,
    tasks: m.totalTasks,
    workload: m.currentWorkload,
    capacity: sprint.capacity,
  })
  const warnings = [m.isOver ? t.sprintStartConfirmOver : null, m.totalTasks === 0 ? t.sprintStartConfirmNoTasks : null]
  return [body, ...warnings.filter((w): w is string => w !== null)].join("\n")
}

/** Success toast template of a transition from `current` to `next` (null: nothing to say). */
export function statusChangedTemplate(current: string, next: string, t: Translations): string | null {
  if (next === "active") return isSprintStart(current, next) ? t.sprintStatusChangedActive : t.sprintStatusChangedReopened
  if (next === "review") return t.sprintStatusChangedReview
  if (next === "done") return t.sprintStatusChangedDone
  return null
}
