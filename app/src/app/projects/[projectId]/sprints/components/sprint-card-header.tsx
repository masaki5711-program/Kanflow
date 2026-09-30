"use client"

import { useLanguage } from "@/lib/language-context"
import { I18nText } from "@/components/i18n-text"
import { pickText } from "@/lib/translation/pick-text"
import { Badge, Button, DisclosureChevron, IconButton, SprintStatusIcon } from "@/components/ui"
import { sprintStatusTone } from "@/lib/design-tokens"
import { dateLocale } from "../lib/locale"
import { NEXT_SPRINT_STATUSES } from "../lib/sprint-metrics"
import type { Sprint, SprintCardActions } from "./types"
import { ArrowRight, Calendar, CirclePlus, MessageSquareText, Pencil, Trash2, Zap } from "lucide-react"

interface Props {
  sprint: Sprint
  isExpanded: boolean
  onToggleExpand: () => void
  onEdit: () => void
  actions: Pick<SprintCardActions, "onRequestStatusChange" | "onAddPbi" | "onOpenStatusDialog" | "onDeleteSprint">
}

export default function SprintCardHeader({ sprint, isExpanded, onToggleExpand, onEdit, actions }: Props) {
  const { t, language } = useLanguage()
  const locale = dateLocale(language)
  const statusLabels: Record<string, string> = {
    planning: t.sprintStatusPlanning, active: t.sprintStatusActive,
    review: t.sprintStatusReview, done: t.sprintStatusDone, archived: t.sprintStatusArchived,
  }
  const name = pickText(sprint.i18n, "sprintName", sprint.sprintName, language).text || sprint.sprintName
  const canEditMembership = sprint.status !== "archived" && sprint.status !== "done"
  const contentId = `sprint-body-${sprint.id}`

  return (
    <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3 min-w-0">
        <IconButton label={t.sprintToggleDetails.replace("{name}", name)} aria-expanded={isExpanded}
          aria-controls={contentId} showTitle={false} onClick={onToggleExpand}
          icon={<DisclosureChevron open={isExpanded} className="w-5 h-5" />} />
        <Zap className="w-5 h-5 text-primary flex-shrink-0" />
        <I18nText as="h3" i18n={sprint.i18n} field="sprintName" original={sprint.sprintName}
          entity={{ type: "sprint", id: sprint.id }} className="text-title font-semibold text-fg truncate" />
        <Badge tone={sprintStatusTone(sprint.status)}>
          <SprintStatusIcon status={sprint.status} />
          {statusLabels[sprint.status] ?? sprint.status}
        </Badge>
        {NEXT_SPRINT_STATUSES[sprint.status]?.map((ns) => {
          const label = t.sprintMoveToStatus.replace("{status}", statusLabels[ns] ?? ns)
          return (
            <Button key={ns} size="sm" variant="secondary" aria-label={label} title={label}
              leftIcon={<ArrowRight className="w-3.5 h-3.5" />}
              onClick={() => actions.onRequestStatusChange(sprint.id, ns)}>
              {statusLabels[ns] ?? ns}
            </Button>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-body text-fg-muted">
          <Calendar className="w-4 h-4 text-fg-subtle" />
          {new Date(sprint.startDate).toLocaleDateString(locale)} - {new Date(sprint.endDate).toLocaleDateString(locale)}
        </span>
        <span className="w-px h-5 bg-border" aria-hidden="true" />
        {canEditMembership && (
          <Button size="sm" variant="secondary" leftIcon={<CirclePlus className="w-3.5 h-3.5" />}
            onClick={() => actions.onAddPbi(sprint.id)}>
            {t.sprintAddPbi}
          </Button>
        )}
        {(sprint.status === "review" || sprint.status === "done") && (
          <Button size="sm" variant="ghost" leftIcon={<MessageSquareText className="w-3.5 h-3.5" />}
            onClick={() => actions.onOpenStatusDialog(sprint)}>
            {t.sprintRetrospectiveMemo}
          </Button>
        )}
        {sprint.status !== "archived" && (
          <Button size="sm" variant="ghost" leftIcon={<Pencil className="w-3.5 h-3.5" />} onClick={onEdit}>
            {t.sprintEditMenu}
          </Button>
        )}
        <span className="w-px h-5 bg-border" aria-hidden="true" />
        <IconButton size="sm" className="hover:text-danger-strong hover:bg-danger-soft" label={t.sprintDeleteNamed.replace("{name}", name)}
          icon={<Trash2 className="w-4 h-4" />} onClick={() => actions.onDeleteSprint(sprint)} />
      </div>
    </div>
  )
}
