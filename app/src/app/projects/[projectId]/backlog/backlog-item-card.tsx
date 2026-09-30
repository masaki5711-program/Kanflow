"use client"

import { memo } from "react"
import { Badge, Button, IconButton, cn } from "@/components/ui"
import { I18nText } from "@/components/i18n-text"
import { useLanguage } from "@/lib/language-context"
import { pickText } from "@/lib/translation/pick-text"
import type { BacklogItem, BacklogStatus } from "./types"
import { ArrowLeft, Calendar, ChevronDown, ChevronUp, CircleCheck, Eye, Lightbulb, Pencil, Scale, Tag, Target, Trash2 } from "lucide-react"

export interface CardActions {
  onMove: (item: BacklogItem, direction: -1 | 1) => void
  onStatusChange: (item: BacklogItem, to: BacklogStatus) => void
  onEdit: (item: BacklogItem) => void
  onDelete: (item: BacklogItem) => void
  onView: (item: BacklogItem) => void
  onInvest: (item: BacklogItem) => void
}

interface Props extends CardActions {
  item: BacklogItem
  section: BacklogStatus
  canEdit: boolean
  isFirst: boolean
  isLast: boolean
}

const SECTION_BORDER: Record<BacklogStatus, string> = {
  ready: "border-l-emerald-500",
  not_ready: "border-l-amber-500",
  completed: "border-l-slate-400",
}

/** Unique sprints (planning/active) already working on this PBI. */
function activeSprints(item: BacklogItem) {
  // sprintItems has one row per sprint task, not per sprint.
  return Array.from(new Map((item.sprintItems ?? []).map((si) => [si.sprint.id, si.sprint])).values())
}

function Chips({ item, inSprintNames }: { item: BacklogItem; inSprintNames: string[] }) {
  const { t, language } = useLanguage()
  const iceboxText = item.iceboxItem
    ? pickText(item.iceboxItem.i18n, "request", item.iceboxItem.request, language).text
    : ""
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5">
      {inSprintNames.length > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary-soft px-2 py-0.5 text-caption font-semibold text-primary-active">
          <span aria-hidden="true">⚡</span> {t.backlogInSprintBadge}
          <span className="font-normal">({inSprintNames.join(", ")})</span>
        </span>
      )}
      {item.epic && (
        <span className="inline-flex items-center gap-1 rounded-full bg-surface-sunken px-2 py-0.5 text-caption text-fg-muted">
          <Tag className="h-3 w-3" />
          <I18nText i18n={item.i18n} field="epic" original={item.epic} noBadge />
        </span>
      )}
      {item.productGoal && (
        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-caption text-indigo-700">
          <Target className="h-3 w-3" />
          <I18nText i18n={item.productGoal.i18n} field="title" original={item.productGoal.title} noBadge />
        </span>
      )}
      {item.iceboxItem && (
        <span
          className="inline-flex max-w-[18rem] items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-caption text-purple-700"
          title={t.backlogIceboxChip.replace("{text}", iceboxText)}
        >
          <Lightbulb className="h-3 w-3 shrink-0" />
          <span className="truncate">{iceboxText}</span>
        </span>
      )}
    </div>
  )
}

function StatusActions({ item, section, onStatusChange }: Pick<Props, "item" | "section" | "onStatusChange">) {
  const { t } = useLanguage()
  if (section === "not_ready") {
    return <IconButton label={t.backlogMoveToReady} size="sm" icon={<CircleCheck className="h-4 w-4 text-primary" />} onClick={() => onStatusChange(item, "ready")} />
  }
  if (section === "ready") {
    return (
      <>
        <IconButton label={t.backlogMoveToNotReady} size="sm" icon={<ArrowLeft className="h-4 w-4 text-warning" />} onClick={() => onStatusChange(item, "not_ready")} />
        <IconButton label={t.backlogMoveToCompleted} size="sm" icon={<CircleCheck className="h-4 w-4 text-success" />} onClick={() => onStatusChange(item, "completed")} />
      </>
    )
  }
  return <IconButton label={t.backlogReturnToReady} size="sm" icon={<ArrowLeft className="h-4 w-4 text-primary" />} onClick={() => onStatusChange(item, "ready")} />
}

/** Memoized: the backlog page passes stable handlers (useStableHandlers). */
export const BacklogItemCard = memo(function BacklogItemCard(props: Props) {
  const { item, section, canEdit, isFirst, isLast } = props
  const { t } = useLanguage()
  const isCompleted = section === "completed"
  const sprints = section === "ready" ? activeSprints(item) : []
  const isInSprint = sprints.length > 0
  const idLabel = String(item.displayId)

  return (
    <li
      className={cn(
        "rounded-ui-md border border-l-4 p-4 hover:shadow-ui-md",
        isInSprint
          ? "border-primary/30 border-l-primary bg-primary-soft/40"
          : isCompleted
            ? "border-border bg-surface-muted border-l-slate-400"
            : cn("border-border bg-surface", SECTION_BORDER[section]),
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {canEdit && !isCompleted && (
            <div className="-my-1 flex flex-col">
              <IconButton
                label={t.backlogMoveUp.replace("{id}", idLabel)}
                size="sm"
                icon={<ChevronUp className="h-4 w-4" />}
                disabled={isFirst}
                data-reorder={`${item.id}:up`}
                onClick={() => props.onMove(item, -1)}
              />
              <IconButton
                label={t.backlogMoveDown.replace("{id}", idLabel)}
                size="sm"
                icon={<ChevronDown className="h-4 w-4" />}
                disabled={isLast}
                data-reorder={`${item.id}:down`}
                onClick={() => props.onMove(item, 1)}
              />
            </div>
          )}

          <span className="mt-0.5 shrink-0 rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-caption text-fg-muted">
            #{item.displayId}
          </span>

          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h3 className={cn("text-body font-semibold", isCompleted ? "text-fg-muted" : "text-fg")}>
                <I18nText
                  i18n={item.i18n}
                  field="initiative"
                  original={item.initiative}
                  entity={{ type: "backlog_item", id: item.id }}
                  fallback={t.sprintNotEntered}
                />
              </h3>
              {isCompleted && (
                <Badge tone="success" size="sm">
                  {t.backlogStatusCompleted}
                </Badge>
              )}
            </div>

            <Chips item={item} inSprintNames={sprints.map((s) => s.sprintName)} />

            {item.userStory ? (
              <I18nText
                as="p"
                i18n={item.i18n}
                field="userStory"
                original={item.userStory}
                entity={{ type: "backlog_item", id: item.id }}
                className="whitespace-pre-wrap text-caption leading-relaxed text-fg-muted"
              />
            ) : (
              <span className="text-caption text-fg-subtle">{t.sprintNotEntered}</span>
            )}

            {isCompleted && item.completedAt && (
              <p className="mt-1.5 flex items-center gap-1 text-caption text-success">
                <Calendar className="h-3 w-3" />
                {t.backlogCompletedDate}: {item.completedAt.slice(0, 10).replace(/-/g, "/")}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0 sm:flex-nowrap">
          <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1 text-caption font-medium text-orange-800">
            <Scale className="h-3 w-3" />
            <span className="sr-only">{t.backlogWorkloadScore}:</span>
            {item.workloadScore}
          </span>
          <Button variant="secondary" size="sm" onClick={() => props.onInvest(item)} leftIcon={<span aria-hidden="true">🤖</span>}>
            {t.aiInvestReview}
          </Button>
          {canEdit ? (
            <>
              <StatusActions item={item} section={section} onStatusChange={props.onStatusChange} />
              {!isCompleted && (
                <>
                  <IconButton label={t.edit} size="sm" icon={<Pencil className="h-4 w-4" />} onClick={() => props.onEdit(item)} />
                  <IconButton label={t.delete} size="sm" icon={<Trash2 className="h-4 w-4 text-danger" />} onClick={() => props.onDelete(item)} />
                </>
              )}
            </>
          ) : (
            <IconButton label={t.view} size="sm" icon={<Eye className="h-4 w-4" />} onClick={() => props.onView(item)} />
          )}
        </div>
      </div>
    </li>
  )
})
