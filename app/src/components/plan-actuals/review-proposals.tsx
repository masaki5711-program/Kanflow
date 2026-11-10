"use client"

import { useState } from "react"
import { Badge, Button, EmptyState, SkeletonCard, useToast } from "@/components/ui"
import { apiFetch, useApiQuery } from "@/hooks"
import { localizeApiError } from "@/hooks/api-client"
import { fillTemplate } from "@/lib/fill-template"
import { formatDateTime } from "@/lib/format-date"
import { useLanguage } from "@/lib/language-context"
import type { ReviewListView, ReviewProposalView } from "./types"

interface Props {
  projectId: string
}

/**
 * AI proposals for the current snapshot (PO / SM, plan.actualsReview): per leaf, exclude it from learning or treat its
 * overrun as waiting, with the quoted reason. Nothing changes until a person accepts one; an accept can be taken back.
 */
export function ReviewProposals({ projectId }: Props) {
  const { t, language } = useLanguage()
  const toast = useToast()
  const url = `/api/projects/${projectId}/plan/actuals/review`
  const { data, isLoading, error, refetch } = useApiQuery<ReviewListView>(url)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function decide(p: ReviewProposalView, decision: "accept" | "reject") {
    if (busyId) return
    setBusyId(p.id)
    try {
      await apiFetch(`${url}/${p.id}`, { method: "PATCH", json: { decision, version: p.version } })
      toast.success(decision === "accept" ? t.pacReviewAcceptedToast : t.pacReviewRejectedToast)
    } catch (err) {
      toast.error(localizeApiError(err, t))
    } finally {
      refetch()
      setBusyId(null)
    }
  }

  const level = (c: ReviewProposalView["confidence"]) => (c === "high" ? t.pacReviewConfidenceHigh : c === "medium" ? t.pacReviewConfidenceMedium : t.pacReviewConfidenceLow)
  const days = (n: number | null) => (n === null ? t.pacNone : fillTemplate(t.pacDays, { n }))
  const jobText = (job: ReviewListView["job"]) =>
    job === "none" ? t.pacReviewJobNone : job === "queued" || job === "running" ? t.pacReviewJobQueued : job === "failed" ? t.pacReviewJobFailed : job === "skipped" ? t.pacReviewJobSkipped : t.pacReviewEmpty

  return (
    <section aria-labelledby="pac-review" className="space-y-3 rounded-ui-lg border border-border bg-surface p-4 shadow-ui-sm sm:p-5">
      <div>
        <h2 id="pac-review" className="text-title font-semibold text-fg">
          {t.pacReviewTitle}
        </h2>
        <p className="mt-1 text-body text-fg-muted">{t.pacReviewHint}</p>
      </div>
      {isLoading && !data ? (
        <SkeletonCard label={t.loading} />
      ) : error && !data ? (
        <EmptyState compact headingLevel={3} title={t.pacReviewLoadFailed} action={<Button size="sm" onClick={() => void refetch()}>{t.errorRetry}</Button>} />
      ) : !data || data.proposals.length === 0 ? (
        <p className="text-body text-fg-muted">{jobText(data?.job ?? "none")}</p>
      ) : (
        <ul className="space-y-3">
          {data.proposals.map((p) => {
            const headingId = `pac-review-${p.id}`
            const busy = busyId === p.id
            return (
              <li key={p.id}>
                <article aria-labelledby={headingId} className="rounded-ui-md border border-border p-3 sm:p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1.5">
                      <h3 id={headingId} className="text-body-lg font-semibold text-fg [overflow-wrap:anywhere]">
                        {p.itemName}
                      </h3>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge tone={p.kind === "exclude_from_learning" ? "warning" : "info"}>{p.kind === "exclude_from_learning" ? t.pacReviewKindExclude : t.pacReviewKindWaiting}</Badge>
                        <Badge tone={p.state === "pending" ? "neutral" : p.state === "accepted" ? "success" : "neutral"} dot>
                          {p.state === "pending" ? t.pacReviewPending : p.state === "accepted" ? t.pacReviewAccepted : t.pacReviewRejected}
                        </Badge>
                      </div>
                      <p className="text-caption text-fg-muted">{p.kind === "exclude_from_learning" ? t.pacReviewKindExcludeHelp : t.pacReviewKindWaitingHelp}</p>
                      <p className="text-caption text-fg-muted tabular-nums">
                        {fillTemplate(t.pacReviewDays, { planned: days(p.plannedDays), actual: days(p.actualDays) })} · {fillTemplate(t.pacReviewConfidence, { level: level(p.confidence) })}
                      </p>
                      {p.quote === null ? (
                        <p className="text-body text-fg-muted">{t.pacReviewReasonHidden}</p>
                      ) : (
                        <figure>
                          <figcaption className="text-caption text-fg-muted">{t.pacReviewReason}</figcaption>
                          <blockquote className="mt-0.5 border-l-2 border-border-strong pl-3 text-body text-fg [overflow-wrap:anywhere] whitespace-pre-wrap">{p.quote}</blockquote>
                        </figure>
                      )}
                      {p.state !== "pending" && p.decidedAt && (
                        <p className="text-caption text-fg-muted">{fillTemplate(t.pacReviewDecidedBy, { name: p.decidedByName ?? t.pacNone, date: formatDateTime(p.decidedAt, language) })}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {p.state !== "accepted" && (
                        <Button size="sm" aria-label={fillTemplate(t.pacReviewAcceptOf, { name: p.itemName })} aria-disabled={busyId !== null || undefined} aria-busy={busy || undefined} onClick={() => void decide(p, "accept")}>
                          {t.pacReviewAccept}
                        </Button>
                      )}
                      {p.state !== "rejected" && (
                        <Button size="sm" variant="secondary" aria-label={fillTemplate(t.pacReviewRejectOf, { name: p.itemName })} aria-disabled={busyId !== null || undefined} aria-busy={busy || undefined} onClick={() => void decide(p, "reject")}>
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
