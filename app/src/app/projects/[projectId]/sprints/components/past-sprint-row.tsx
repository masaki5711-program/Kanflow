"use client"

import { useLanguage } from "@/lib/language-context"
import { I18nText } from "@/components/i18n-text"
import { Badge, DisclosureChevron, SprintStatusIcon } from "@/components/ui"
import { sprintStatusTone } from "@/lib/design-tokens"
import { formatDateRange } from "@/lib/format-date"
import { computeSprintMetrics } from "../lib/sprint-metrics"
import type { Sprint } from "./types"

interface Props {
  sprint: Sprint
  pointUnit: string
  onOpen: () => void
}

/**
 * A finished sprint as one line (name, status, period, task completion and
 * completed points). Opening it swaps the line for the full sprint card.
 */
export default function PastSprintRow({ sprint, pointUnit, onOpen }: Props) {
  const { t, language } = useLanguage()
  const m = computeSprintMetrics(sprint)
  const pct = m.totalTasks > 0 ? Math.round((m.doneTasks / m.totalTasks) * 100) : 0
  const statusLabel = sprint.status === "archived" ? t.sprintStatusArchived : t.sprintStatusDone
  const summary = t.sprintUxPastSummary
    .replace("{done}", String(m.doneTasks)).replace("{total}", String(m.totalTasks))
    .replace("{pct}", String(pct)).replace("{score}", `${m.completedWorkload} ${pointUnit}`)

  return (
    <div className="rounded-ui-md border border-border bg-surface shadow-ui-sm">
      <button type="button" onClick={onOpen} aria-expanded={false}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-ui-md px-4 py-3 text-left hover:bg-surface-muted">
        <DisclosureChevron open={false} className="h-4 w-4 shrink-0" />
        <I18nText as="span" i18n={sprint.i18n} field="sprintName" original={sprint.sprintName} noBadge
          className="min-w-0 truncate text-body font-semibold text-fg" />
        <Badge tone={sprintStatusTone(sprint.status)} size="sm">
          <SprintStatusIcon status={sprint.status} />
          {statusLabel}
        </Badge>
        <span className="text-caption text-fg-muted">{formatDateRange(sprint.startDate, sprint.endDate, language, { utc: true })}</span>
        <span className="ml-auto text-caption text-fg-muted">{summary}</span>
      </button>
    </div>
  )
}
