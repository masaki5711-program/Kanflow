"use client"

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { useLanguage } from "@/lib/language-context"
import { Badge, cn } from "@/components/ui"
import { CommentThread } from "@/components/comments/comment-thread"
import { useCommentCounts } from "@/components/comments/use-comment-thread"
import { EntityHistory } from "@/components/activity/entity-history"

export type PbiTabKey = "details" | "comments" | "history"
type TabKey = PbiTabKey
const TABS: readonly TabKey[] = ["details", "comments", "history"]

interface Props {
  projectId: string
  pbiId: string
  /** The read or edit body of the PBI. */
  details: ReactNode
  /** Tab selected on open (e.g. "comments" from a mention notification). Default: details. */
  initialTab?: TabKey
}

type T = ReturnType<typeof useLanguage>["t"]
type PT = ReturnType<typeof useLanguage>["pt"]

/** Localized labels of the PBI fields tracked by the activity log. */
export function pbiFieldLabels(t: T, pt: PT): Record<string, string> {
  return {
    initiative: pt.backlogInitiative,
    epic: pt.backlogEpic,
    userStory: pt.backlogUserStory,
    acceptanceCriteria: pt.backlogAcceptanceCriteria,
    referenceDoc: t.backlogReferenceDoc,
    workloadScore: pt.backlogWorkloadScore,
    status: t.sprintStatus,
    assignedPo: pt.rolePO,
    poNote: t.backlogPoNote,
    notReadyReason: t.backlogNotReadyReason,
    iceboxItemId: pt.iceboxTitle,
    productGoalId: t.historyFieldProductGoal,
  }
}

/** Display text of a PBI field value in the history (status codes localized, ids hidden). */
export function formatPbiValue(t: T, field: string, value: string | number | boolean): string {
  if (field === "status") {
    if (value === "ready") return t.backlogStatusReady
    if (value === "not_ready") return t.backlogStatusNotReady
    if (value === "completed") return t.backlogStatusCompleted
  }
  if (field === "iceboxItemId" || field === "productGoalId") return t.historyChanged
  return String(value)
}

/**
 * Details / Comments / History tabs of the PBI detail modal (WAI-ARIA tabs:
 * ←/→/Home/End move between tabs). Comments and history load on first open
 * and stay mounted afterwards so switching back keeps their state.
 */
export function PbiDetailTabs({ projectId, pbiId, details, initialTab = "details" }: Props) {
  const { t, pt } = useLanguage()
  const [active, setActive] = useState<TabKey>(initialTab)
  const [visited, setVisited] = useState<ReadonlySet<TabKey>>(() => new Set<TabKey>(["details", initialTab]))
  const { counts, adjustCount } = useCommentCounts(projectId, "pbi", [pbiId])
  const count = counts[pbiId]
  const baseId = useId()
  const tabRefs = useRef<Record<TabKey, HTMLButtonElement | null>>({ details: null, comments: null, history: null })

  const labels: Record<TabKey, string> = { details: t.commentsTabDetails, comments: t.commentsTitle, history: t.historyTitle }

  function select(key: TabKey, focus = false) {
    setActive(key)
    setVisited((prev) => (prev.has(key) ? prev : new Set([...prev, key])))
    if (focus) tabRefs.current[key]?.focus()
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const i = TABS.indexOf(active)
    const next =
      e.key === "ArrowRight" ? TABS[(i + 1) % TABS.length]
        : e.key === "ArrowLeft" ? TABS[(i - 1 + TABS.length) % TABS.length]
          : e.key === "Home" ? TABS[0]
            : e.key === "End" ? TABS[TABS.length - 1]
              : null
    if (!next) return
    e.preventDefault()
    select(next, true)
  }

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label={t.backlogDetailTitle} onKeyDown={onKeyDown} className="flex gap-1 border-b border-border">
        {TABS.map((key) => (
          <button key={key} ref={(el) => { tabRefs.current[key] = el }} type="button" role="tab"
            id={`${baseId}-tab-${key}`} aria-controls={`${baseId}-panel-${key}`} aria-selected={active === key}
            tabIndex={active === key ? 0 : -1} onClick={() => select(key)}
            className={cn(
              "-mb-px inline-flex min-h-9 items-center gap-1.5 border-b-2 px-3 text-body font-medium transition-colors",
              active === key ? "border-primary text-primary-strong" : "border-transparent text-fg-muted hover:text-fg",
            )}>
            {labels[key]}
            {key === "comments" && typeof count === "number" && count > 0 && (
              <Badge tone="primary" size="sm">
                <span aria-hidden="true">{count}</span>
                <span className="sr-only">{t.commentsCountLabel.replace("{count}", String(count))}</span>
              </Badge>
            )}
          </button>
        ))}
      </div>
      {TABS.map((key) => (
        <div key={key} role="tabpanel" id={`${baseId}-panel-${key}`} aria-labelledby={`${baseId}-tab-${key}`}
          hidden={active !== key}>
          {key === "details" && details}
          {key === "comments" && visited.has("comments") && (
            <CommentThread projectId={projectId} entityType="pbi" entityId={pbiId}
              onCountDelta={(d) => adjustCount(pbiId, d)} />
          )}
          {key === "history" && visited.has("history") && (
            <EntityHistory projectId={projectId} entityType="pbi" entityId={pbiId}
              fieldLabels={pbiFieldLabels(t, pt)} formatValue={(f, v) => formatPbiValue(t, f, v)} />
          )}
        </div>
      ))}
    </div>
  )
}
