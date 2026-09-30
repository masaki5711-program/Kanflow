"use client"

import { memo, type KeyboardEvent, type PointerEvent } from "react"
import { Badge, Button, IconButton, cn } from "@/components/ui"
import { I18nText } from "@/components/i18n-text"
import { useLanguage } from "@/lib/language-context"
import { pickText } from "@/lib/translation/pick-text"
import { CardMenu } from "./card-menu"
import type { BacklogItem, BacklogStatus } from "./types"
import { DND_HANDLE_ATTR, DND_ROW_ATTR } from "./use-reorder-dnd"
import { backlogItemElementId } from "./use-created-highlight"
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpToLine,
  Calendar,
  CircleCheck,
  Eye,
  GripVertical,
  Lightbulb,
  Pencil,
  Scale,
  Tag,
  Target,
  Trash2,
} from "lucide-react"

/** Id of the hidden keyboard help that every drag handle is described by. */
export const DND_HELP_ID = "backlog-dnd-help"

export interface CardActions {
  onOpen: (item: BacklogItem, mode: "read" | "edit") => void
  onStatusChange: (item: BacklogItem, to: BacklogStatus) => void
  onDelete: (item: BacklogItem) => void
  onInvest: (item: BacklogItem) => void
  onToggleSelect: (item: BacklogItem, shift: boolean) => void
  onMoveToEdge: (item: BacklogItem, edge: "top" | "bottom") => void
  onHandleKeyDown: (e: KeyboardEvent<HTMLElement>, item: BacklogItem) => void
  onHandlePointerDown: (e: PointerEvent<HTMLElement>, item: BacklogItem) => void
  onHandleBlur: () => void
}

export interface CardPermissions {
  canEdit: boolean
  canReorder: boolean
  canDelete: boolean
  /** ai.use (any project member): offers the INVEST review. */
  canInvest: boolean
}

interface Props extends CardActions, CardPermissions {
  item: BacklogItem
  section: BacklogStatus
  selectMode: boolean
  isSelected: boolean
  isDragging: boolean
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
  const iceboxText = item.iceboxItem ? pickText(item.iceboxItem.i18n, "request", item.iceboxItem.request, language).text : ""
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

function DragHandle(props: Pick<Props, "item" | "isDragging" | "onHandleKeyDown" | "onHandlePointerDown" | "onHandleBlur">) {
  const { t } = useLanguage()
  const { item } = props
  return (
    <button
      type="button"
      {...{ [DND_HANDLE_ATTR]: item.id }}
      aria-label={t.backlogDragHandle.replace("{id}", String(item.displayId))}
      aria-describedby={DND_HELP_ID}
      aria-pressed={props.isDragging}
      onKeyDown={(e) => props.onHandleKeyDown(e, item)}
      onPointerDown={(e) => props.onHandlePointerDown(e, item)}
      onBlur={props.onHandleBlur}
      className="-my-1 inline-flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-ui-sm text-fg-subtle hover:bg-surface-sunken hover:text-fg active:cursor-grabbing"
    >
      <GripVertical className="h-4 w-4" aria-hidden="true" />
    </button>
  )
}

/** Memoized: the backlog page passes stable handlers (useStableHandlers). */
export const BacklogItemCard = memo(function BacklogItemCard(props: Props) {
  const { item, section, canEdit, canReorder, canDelete, canInvest, selectMode, isSelected, isDragging } = props
  const { t, language } = useLanguage()
  const isCompleted = section === "completed"
  const sprints = section === "ready" ? activeSprints(item) : []
  const isInSprint = sprints.length > 0
  const idLabel = String(item.displayId)
  const reorderable = canReorder && !isCompleted

  return (
    <li
      id={backlogItemElementId(item.id)}
      {...{ [DND_ROW_ATTR]: item.id }}
      className={cn(
        "rounded-ui-md border border-l-4 p-4 hover:shadow-ui-md",
        isInSprint
          ? "border-primary/30 border-l-primary bg-primary-soft/40"
          : isCompleted
            ? "border-border border-l-slate-400 bg-surface-muted"
            : cn("border-border bg-surface", SECTION_BORDER[section]),
        isSelected && "ring-2 ring-primary",
        isDragging && "opacity-60 shadow-ui-lg ring-2 ring-primary/60",
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          {reorderable && <DragHandle {...props} />}
          {selectMode && (
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 shrink-0 accent-primary"
              aria-label={t.backlogSelectItem.replace("{id}", idLabel)}
              checked={isSelected}
              onChange={() => {}}
              onClick={(e) => props.onToggleSelect(item, e.shiftKey)}
            />
          )}
          <span className="mt-0.5 shrink-0 rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-caption text-fg-muted">#{item.displayId}</span>

          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h3 className={cn("text-body font-semibold", isCompleted ? "text-fg-muted" : "text-fg")}>
                <button type="button" onClick={() => props.onOpen(item, "read")} className="text-left hover:text-primary-strong hover:underline">
                  <I18nText i18n={item.i18n} field="initiative" original={item.initiative} entity={{ type: "backlog_item", id: item.id }} fallback={t.sprintNotEntered} />
                </button>
              </h3>
              {isCompleted && (
                <Badge tone="success" size="sm">
                  {t.backlogStatusCompleted}
                </Badge>
              )}
            </div>

            <Chips item={item} inSprintNames={sprints.map((s) => pickText(s.i18n, "sprintName", s.sprintName, language).text || s.sprintName)} />

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
          {canInvest && (
            <Button variant="secondary" size="sm" onClick={() => props.onInvest(item)} leftIcon={<span aria-hidden="true">🤖</span>}>
              {t.aiInvestReview}
            </Button>
          )}
          {canEdit ? (
            <>
              <StatusActions item={item} section={section} onStatusChange={props.onStatusChange} />
              {!isCompleted && <IconButton label={t.edit} size="sm" icon={<Pencil className="h-4 w-4" />} onClick={() => props.onOpen(item, "edit")} />}
            </>
          ) : (
            <IconButton label={t.view} size="sm" icon={<Eye className="h-4 w-4" />} onClick={() => props.onOpen(item, "read")} />
          )}
          {canDelete && !isCompleted && (
            <IconButton label={t.delete} size="sm" icon={<Trash2 className="h-4 w-4 text-danger" />} onClick={() => props.onDelete(item)} />
          )}
          {reorderable && (
            <CardMenu
              label={t.backlogMoreActions.replace("{id}", idLabel)}
              items={[
                { key: "top", label: t.backlogMoveToTop, icon: <ArrowUpToLine className="h-4 w-4" />, onSelect: () => props.onMoveToEdge(item, "top") },
                { key: "bottom", label: t.backlogMoveToBottom, icon: <ArrowDownToLine className="h-4 w-4" />, onSelect: () => props.onMoveToEdge(item, "bottom") },
              ]}
            />
          )}
        </div>
      </div>
    </li>
  )
})
