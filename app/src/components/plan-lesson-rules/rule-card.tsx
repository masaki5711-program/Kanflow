"use client"

import type { ReactNode } from "react"
import { Badge, cn } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { fillTemplate } from "@/lib/fill-template"
import { formatLongDate } from "@/lib/format-date"
import { ruleKindLabel } from "@/lib/plan-lesson-rules/describe"
import { projectTypeName } from "./promotion-dialog"
import type { LessonRuleView } from "./types"
import { useRuleSummary } from "./use-rule-summary"

/** "系統 X · 種類 Y" for a shared rule's filters or a promotion request. */
export function useFilterLabel(): (lineage: string | null, projectType: string | null) => string {
  const { t, language } = useLanguage()
  return (lineage, projectType) =>
    [
      lineage ? fillTemplate(t.plrFilterLineage, { value: lineage }) : null,
      projectType ? fillTemplate(t.plrFilterProjectType, { value: projectTypeName(projectType, language) }) : null,
    ]
      .filter(Boolean)
      .join(" · ")
}

/** id of a rule card's heading: the focus target after an action moves or re-renders the card. */
export const ruleHeadingId = (ruleId: string): string => `plr-rule-${ruleId}`

const STATE_ACCENT: Record<LessonRuleView["state"], string> = {
  draft: "border-l-warning",
  confirmed: "border-l-success",
  retired: "border-l-border-strong",
}

/** Badges whose text comes from data or is long: allowed to wrap (no horizontal scroll at 320 px / 400 % zoom). */
const WRAP = "whitespace-normal rounded-ui-sm text-left [overflow-wrap:anywhere]"

interface Props {
  rule: LessonRuleView
  /** Extra line under the summary (e.g. the source project on the admin page). */
  meta?: ReactNode
  /** Buttons, right-aligned on wide screens. */
  actions?: ReactNode
  /** An action on this rule is in flight. */
  busy?: boolean
  headingLevel?: "h3" | "h4"
}

/**
 * One rule: the kind as a quiet label, the sentence WITH its numbers as the headline (what a confirmer must read),
 * then the quote and the source / state badges. The left accent follows the state; text always says it too.
 */
export function RuleCard({ rule, meta, actions, busy = false, headingLevel = "h3" }: Props) {
  const { t, language } = useLanguage()
  const filterLabel = useFilterLabel()
  const summaryOf = useRuleSummary()
  const Heading = headingLevel
  const headingId = ruleHeadingId(rule.id)
  const stateLabel = rule.state === "draft" ? t.plrStateDraft : rule.state === "confirmed" ? t.plrStateConfirmed : t.plrStateRetired
  const stateTone = rule.state === "draft" ? "warning" : rule.state === "confirmed" ? "success" : "neutral"

  return (
    <article
      aria-labelledby={headingId}
      aria-busy={busy || undefined}
      className={cn(
        "rounded-ui-md border border-l-4 border-border bg-surface p-4 shadow-ui-sm transition-[box-shadow,opacity] focus-within:shadow-ui-md hover:shadow-ui-md sm:p-5",
        STATE_ACCENT[rule.state],
        rule.state === "retired" && "bg-surface-muted",
        busy && "opacity-70",
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-caption font-medium text-fg-muted">{ruleKindLabel(rule.kind, t)}</p>
          <Heading
            id={headingId}
            tabIndex={-1}
            className={cn(
              "mt-1 rounded-ui-sm text-body-lg font-semibold leading-snug text-fg tabular-nums [overflow-wrap:anywhere] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              rule.state === "retired" && "text-fg-muted line-through decoration-1",
            )}
          >
            {summaryOf(rule.kind, rule.params)}
          </Heading>
          {rule.quote && (
            <blockquote className="mt-3 border-l-2 border-border pl-3 text-body text-fg-muted [overflow-wrap:anywhere] whitespace-pre-line">
              <span className="sr-only">{t.plrQuoteLabel}</span>
              {rule.quote}
            </blockquote>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Badge tone={stateTone} dot>
              {stateLabel}
            </Badge>
            {rule.scope === "shared" && (
              <Badge tone="info" className={WRAP}>
                {fillTemplate(t.plrScopeSharedFilters, { filters: filterLabel(rule.lineage, rule.projectType) })}
              </Badge>
            )}
            {rule.promotionRequest && <Badge tone="primary">{t.plrBadgePromotionPending}</Badge>}
            {rule.fromRetrospective && <Badge>{t.plrBadgeRetro}</Badge>}
            {rule.createdByKind === "llm" && <Badge>{t.plrBadgeLlm}</Badge>}
            {rule.suspended ? (
              <Badge tone="danger" className={WRAP}>
                {t.plrBadgeSuspended}
              </Badge>
            ) : (
              rule.sourceConfidential && (
                <Badge tone="warning" className={WRAP}>
                  {t.plrBadgeConfidential}
                </Badge>
              )
            )}
            {rule.confirmedAt && rule.state === "confirmed" && (
              <span className="text-caption text-fg-muted">{fillTemplate(t.plrConfirmedBy, { date: formatLongDate(rule.confirmedAt, language) })}</span>
            )}
          </div>
          {meta && <div className="mt-2 text-caption text-fg-muted [overflow-wrap:anywhere]">{meta}</div>}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end" role="group" aria-labelledby={headingId}>
            {actions}
          </div>
        )}
      </div>
    </article>
  )
}
