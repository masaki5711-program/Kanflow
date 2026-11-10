"use client"

import { useState } from "react"
import { Badge, Button, EmptyState, SkeletonCard, useToast } from "@/components/ui"
import { useFocusAfterReload } from "@/components/plan-lesson-rules/use-focus-after-reload"
import { apiFetch, useApiQuery } from "@/hooks"
import { localizeApiError } from "@/hooks/api-client"
import { fillTemplate } from "@/lib/fill-template"
import { formatDateTime } from "@/lib/format-date"
import { useLanguage } from "@/lib/language-context"
import type { ReviewListView, ReviewProposalView } from "./types"

interface Props {
  projectId: string
}

const SECTION_ID = "pac-review"
const headingIdOf = (id: string) => `pac-review-${id}`

/**
 * AI proposals for the current snapshot (PO / SM, plan.actualsReview): per leaf, exclude it from learning or treat its
 * overrun as waiting, with the quoted reason. Nothing changes until a person accepts one; an accept can be taken back.
 * A leaf that cites a confidential PBI now is a placeholder (no name, days or reason) that can only be declined.
 */
export function ReviewProposals({ projectId }: Props) {
  const { t, language } = useLanguage()
  const toast = useToast()
  const url = `/api/projects/${projectId}/plan/actuals/review`
  const { data, isLoading, error, refetch } = useApiQuery<ReviewListView>(url)
  const [busyId, setBusyId] = useState<string | null>(null)
  // After a decision the buttons change: focus goes to the card's heading once the reloaded list has rendered.
  const requestFocus = useFocusAfterReload(data, false, headingIdOf)

  async function decide(p: ReviewProposalView, decision: "accept" | "reject") {
    if (busyId) return
    setBusyId(p.id)
    try {
      await apiFetch(`${url}/${p.id}`, { method: "PATCH", json: { decision, version: p.version } })
      toast.success(decision === "accept" ? t.pacReviewAcceptedToast : t.pacReviewRejectedToast)
    } catch (err) {
      toast.error(localizeApiError(err, t))
    } finally {
      requestFocus(p.id, SECTION_ID)
      refetch()
      setBusyId(null)
    }
  }

  const level = (c: ReviewProposalView["confidence"]) => (c === "high" ? t.pacReviewConfidenceHigh : c === "medium" ? t.pacReviewConfidenceMedium : t.pacReviewConfidenceLow)
  const days = (n: number | null) => (n === null ? t.pacNone : fillTemplate(t.pacDays, { n }))
  const jobText = (list: ReviewListView | undefined) => {
    const job = list?.job ?? "none"
    if (job === "none") return t.pacReviewJobNone
    if (job === "queued" || job === "running") return t.pacReviewJobQueued
    if (job === "failed") return t.pacReviewJobFailed
    if (job === "skipped") return list?.jobReason === "prompt_budget" ? t.pacReviewJobSkippedBudget : t.pacReviewJobSkipped
    return t.pacReviewEmpty
  }

  return (
    <section aria-labelledby={SECTION_ID} className="space-y-3 rounded-ui-lg border border-border bg-surface p-4 shadow-ui-sm sm:p-5">
      <div>
        <h2 id={SECTION_ID} tabIndex={-1} className="rounded-ui-sm text-title font-semibold text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          {t.pacReviewTitle}
        </h2>
        <p className="mt-1 text-body text-fg-muted">{t.pacReviewHint}</p>
        {data && data.capped > 0 && <p className="mt-1 text-caption text-warning-strong">{fillTemplate(t.pacReviewCapped, { n: data.capped })}</p>}
      </div>
      {isLoading && !data ? (
        <SkeletonCard label={t.loading} />
      ) : error && !data ? (
        <EmptyState compact headingLevel={3} title={t.pacReviewLoadFailed} action={<Button size="sm" onClick={() => void refetch()}>{t.errorRetry}</Button>} />
      ) : !data || data.proposals.length === 0 ? (
        <p className="text-body text-fg-muted">{jobText(data)}</p>
      ) : (
        <ul className="space-y-3">
          {data.proposals.map((p) => {
            const headingId = headingIdOf(p.id)
            const busy = busyId === p.id
            const name = p.itemName ?? t.pacReviewHiddenItem
            return (
              <li key={p.id}>
                <article aria-labelledby={headingId} className="rounded-ui-md border border-border p-3 sm:p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1.5">
                      <h3 id={headingId} tabIndex={-1} className="rounded-ui-sm text-body-lg font-semibold text-fg [overflow-wrap:anywhere] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                        {name}
                      </h3>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge tone={p.kind === "exclude_from_learning" ? "warning" : "info"}>{p.kind === "exclude_from_learning" ? t.pacReviewKindExclude : t.pacReviewKindWaiting}</Badge>
                        <Badge tone={p.state === "accepted" ? "success" : "neutral"} dot>
                          {p.state === "pending" ? t.pacReviewPending : p.state === "accepted" ? t.pacReviewAccepted : t.pacReviewRejected}
                        </Badge>
                      </div>
                      <p className="text-caption text-fg-muted">{p.kind === "exclude_from_learning" ? t.pacReviewKindExcludeHelp : t.pacReviewKindWaitingHelp}</p>
                      {p.hidden ? (
                        <p className="text-body text-fg-muted">{t.pacReviewReasonHidden}</p>
                      ) : (
                        <>
                          <p className="text-caption text-fg-muted tabular-nums">
                            {fillTemplate(t.pacReviewDays, { planned: days(p.plannedDays), actual: days(p.actualDays) })} · {fillTemplate(t.pacReviewConfidence, { level: level(p.confidence) })}
                          </p>
                          <figure>
                            <figcaption className="text-caption text-fg-muted">{p.quoteSource === "note" ? t.pacReviewReasonFromNote : t.pacReviewReason}</figcaption>
                            <blockquote className="mt-0.5 whitespace-pre-wrap border-l-2 border-border-strong pl-3 text-body text-fg [overflow-wrap:anywhere]">{p.quote}</blockquote>
                          </figure>
                        </>
                      )}
                      {p.state !== "pending" && p.decidedAt && (
                        <p className="text-caption text-fg-muted">{fillTemplate(t.pacReviewDecidedBy, { name: p.decidedByName ?? t.pacNone, date: formatDateTime(p.decidedAt, language) })}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {p.state !== "accepted" && !p.hidden && (
                        <Button size="sm" aria-label={fillTemplate(t.pacReviewAcceptOf, { name })} aria-disabled={busyId !== null || undefined} aria-busy={busy || undefined} onClick={() => void decide(p, "accept")}>
                          {t.pacReviewAccept}
                        </Button>
                      )}
                      {p.state !== "rejected" && (
                        <Button size="sm" variant="secondary" aria-label={fillTemplate(t.pacReviewRejectOf, { name })} aria-disabled={busyId !== null || undefined} aria-busy={busy || undefined} onClick={() => void decide(p, "reject")}>
                          {p.state === "accepted" ? t.pacReviewUndoAccept : t.pacReviewReject}
                        </Button>
                      )}
                    </div>
                  </div>
                </article>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
