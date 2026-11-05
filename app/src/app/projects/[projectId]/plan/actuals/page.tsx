"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useEffect, useState } from "react"
import { ArrowLeft, ClipboardCheck } from "lucide-react"
import { Badge, Button, EmptyState, Field, PageHeader, SkeletonCard, Textarea, cn, useConfirm, useToast } from "@/components/ui"
import { useProjectDocumentTitle } from "@/components/app-shell/project-title-context"
import { AttributesEditor } from "@/components/plan-actuals/attributes-editor"
import { LearningSwitchDialog } from "@/components/plan-actuals/learning-switch-dialog"
import { SnapshotItems } from "@/components/plan-actuals/snapshot-items"
import type { ActualsResponse, PreviewIssue, SnapshotView } from "@/components/plan-actuals/types"
import { useFocusAfterReload } from "@/components/plan-lesson-rules/use-focus-after-reload"
import { apiFetch, useApiQuery } from "@/hooks"
import { localizeApiError } from "@/hooks/api-client"
import type { Translations } from "@/lib/i18n"
import { FINALIZE_NOTE_MAX } from "@/services/plan-actuals/actuals.schemas"
import { fillTemplate } from "@/lib/fill-template"
import { formatDateTime, formatLongDate } from "@/lib/format-date"
import { useLanguage } from "@/lib/language-context"

const snapshotHeadingId = (id: string) => `pac-snapshot-${id}`
const SNAPSHOTS_ID = "pac-snapshots"

function issueText(i: PreviewIssue, t: Translations): string {
  switch (i.kind) {
    case "repository_unreadable":
      return i.repositoryRef ? fillTemplate(t.pacIssueLine, { name: i.repositoryRef, what: t.pacIssueRepoUnreadable }) : t.pacIssueRepoUnreadableHidden
    case "no_schedule_load":
      return t.pacIssueNoScheduleLoad
    case "schedule_unreadable":
      return t.pacIssueScheduleUnreadable
    default: {
      const what =
        i.kind === "missing_actual"
          ? t.pacIssueMissingActual
          : i.kind === "start_after_end"
            ? t.pacIssueStartAfterEnd
            : i.kind === "actual_over_baseline"
              ? t.pacIssueOverBaseline
              : i.kind === "empty_span"
                ? t.pacIssueEmptySpan
                : i.kind === "missing_baseline"
                  ? t.pacIssueMissingBaseline
                  : t.pacIssueHistoryUnreadable
      return fillTemplate(t.pacIssueLine, { name: i.name || t.pacIssueNoName, what })
    }
  }
}

const issueKey = (i: PreviewIssue): string => ("planItemId" in i ? `${i.planItemId}:${i.kind}` : i.kind === "repository_unreadable" ? `repo:${i.repositoryRef}` : i.kind)

/**
 * 実績を確定 (plan 12 E1): what would be frozen now (with the items to check), finalize / re-finalize, the finalized
 * records with the learning switch, and the project's 設備・工程・タグ.
 */
export default function ActualsPage() {
  const projectId = useParams().projectId as string
  const { t, language } = useLanguage()
  useProjectDocumentTitle(t.pacTitle)
  const toast = useToast()
  const confirm = useConfirm()
  const url = `/api/projects/${projectId}/plan/actuals`
  const { data, isLoading, error, refetch } = useApiQuery<ActualsResponse>(url, { toastOnError: () => t.pacLoadFailed })
  const [busy, setBusy] = useState(false)
  // 確定のメモ (optional): read with the retrospectives by the E6 rule drafts.
  const [note, setNote] = useState("")
  const [switchingId, setSwitchingId] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const preview = data?.preview
  const snapshots = data?.snapshots ?? []
  const canFinalize = data?.permissions.finalize ?? false
  const current = snapshots.find((s) => s.current)
  // Resolved from the latest list on every render, so a retry after a 409 uses the current version.
  const switching = switchingId ? (snapshots.find((s) => s.id === switchingId && s.current) ?? null) : null
  const requestFocus = useFocusAfterReload(data, switching !== null, snapshotHeadingId)
  // Someone re-finalized meanwhile: the record is no longer the current one — close the dialog and say so.
  useEffect(() => {
    if (switchingId && data && !switching) {
      setSwitchingId(null)
      toast.error(t.apiErrPlanActualsChanged)
      requestFocus(null, SNAPSHOTS_ID)
    }
  }, [switchingId, data, switching, toast, t, requestFocus])
  const nothingToFinalize = !preview || preview.leafCount === 0
  const dateLabel = (s: SnapshotView) => fillTemplate(t.pacFinalizedAt, { date: formatDateTime(s.finalizedAt, language) })

  async function finalize() {
    if (busy || !preview || nothingToFinalize) return
    const n = preview.issues.length
    const yes = await confirm({
      title: t.pacFinalizeTitle,
      message: n > 0 ? `${fillTemplate(t.pacFinalizeWithIssues, { n })}\n\n${t.pacFinalizeBody}` : t.pacFinalizeBody,
      confirmLabel: t.pacFinalizeAction,
      variant: n > 0 ? "warning" : "info",
    })
    if (!yes) return
    setBusy(true)
    try {
      // The count the user saw: if new issues appeared meanwhile, the server shows them instead of finalizing.
      const snap = await apiFetch<SnapshotView>(url, { method: "POST", json: { acknowledgedIssueCount: n, ...(note.trim() ? { note } : {}) } })
      setNote("")
      toast.success(t.pacFinalized)
      requestFocus(snap.id, SNAPSHOTS_ID)
    } catch (err) {
      // The confirm dialog already returned focus to the button, which stays in place.
      toast.error(localizeApiError(err, t))
    } finally {
      refetch()
      setBusy(false)
    }
  }

  async function switchLearning(snapshot: SnapshotView, reason: string) {
    if (busy) return
    setBusy(true)
    try {
      await apiFetch(`${url}/${snapshot.id}`, { method: "PATCH", json: { includeInLearning: !snapshot.includeInLearning, reason, version: snapshot.version } })
      toast.success(t.pacLearningSaved)
      requestFocus(snapshot.id, SNAPSHOTS_ID)
      setSwitchingId(null)
    } catch (err) {
      // The dialog stays open (focus stays in it); the reload gives it the snapshot as it is now.
      toast.error(localizeApiError(err, t))
    } finally {
      refetch()
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href={`/projects/${projectId}/plan`} className="inline-flex items-center gap-1 rounded-ui-sm text-body text-fg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        {t.pacBackToPlan}
      </Link>
      <PageHeader title={t.pacTitle} description={t.pacDescription} icon={<ClipboardCheck className="h-6 w-6" />} />

      {isLoading && !data ? (
        <div className="space-y-3">
          <SkeletonCard label={t.loading} />
          <SkeletonCard />
        </div>
      ) : error && !data ? (
        <EmptyState headingLevel={2} title={t.pacLoadFailed} action={<Button onClick={() => void refetch()}>{t.errorRetry}</Button>} />
      ) : (
        preview && (
          <>
            <section aria-labelledby="pac-now" className="space-y-4 rounded-ui-lg border border-border bg-surface p-4 shadow-ui-sm sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 id="pac-now" tabIndex={-1} className="rounded-ui-sm text-title font-semibold text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    {t.pacNowTitle}
                  </h2>
                  <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-body text-fg-muted tabular-nums">
                    <span>{fillTemplate(t.pacLeafCount, { n: preview.leafCount })}</span>
                    <span className="font-medium text-fg">{fillTemplate(t.pacCompleteCount, { n: preview.completeCount })}</span>
                    <span>{fillTemplate(t.pacRepoCount, { n: preview.repoCount })}</span>
                  </p>
                </div>
                {canFinalize && (
                  <div className="flex flex-col items-start gap-1 sm:items-end">
                    <Button onClick={() => void finalize()} aria-disabled={busy || nothingToFinalize || undefined} aria-busy={busy || undefined} aria-describedby={nothingToFinalize ? "pac-nothing" : undefined}>
                      {current ? t.pacFinalizeAgain : t.pacFinalize}
                    </Button>
                    {nothingToFinalize && (
                      <p id="pac-nothing" className="text-caption text-fg-muted">
                        {t.pacNothingToFinalize}
                      </p>
                    )}
                  </div>
                )}
              </div>
              {canFinalize && !nothingToFinalize && (
                <Field label={t.pacNoteLabel} hint={t.pacNoteHint}>
                  <Textarea value={note} rows={3} maxLength={FINALIZE_NOTE_MAX} onChange={(e) => setNote(e.target.value)} />
                </Field>
              )}
              <div>
                <h3 className="text-body font-semibold text-fg">{t.pacIssuesTitle}</h3>
                {preview.issues.length === 0 ? (
                  <p className="mt-1 text-body text-fg-muted">{t.pacIssuesNone}</p>
                ) : (
                  <>
                    <ul className="mt-2 space-y-1.5">
                      {preview.issues.map((i) => (
                        <li key={issueKey(i)} className="flex gap-2 text-body text-fg [overflow-wrap:anywhere]">
                          <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                          {issueText(i, t)}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-caption text-fg-muted">{t.pacIssuesNote}</p>
                  </>
                )}
              </div>
            </section>

            <section aria-labelledby={SNAPSHOTS_ID} className="space-y-3">
              <h2 id={SNAPSHOTS_ID} tabIndex={-1} className="rounded-ui-sm text-title font-semibold text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                {t.pacSnapshotsTitle}
              </h2>
              {snapshots.length === 0 ? (
                <EmptyState compact headingLevel={3} title={t.pacSnapshotsEmpty} />
              ) : (
                <ul className="space-y-3">
                  {snapshots.map((s) => {
                    const label = dateLabel(s)
                    const expanded = open === s.id
                    return (
                      <li key={s.id}>
                        <article
                          aria-labelledby={snapshotHeadingId(s.id)}
                          className={cn("rounded-ui-lg border border-l-4 border-border p-4 shadow-ui-sm sm:p-5", s.current ? "border-l-success bg-surface" : "border-l-border-strong bg-surface-muted")}
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <h3 id={snapshotHeadingId(s.id)} tabIndex={-1} className="rounded-ui-sm text-body-lg font-semibold text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                                {label}
                              </h3>
                              <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-caption text-fg-muted tabular-nums">
                                <span>{fillTemplate(t.pacClosedAt, { date: formatLongDate(s.closedAt, language, { utc: true }) })}</span>
                                <span>{fillTemplate(t.pacLeafCount, { n: s.leafCount })}</span>
                                <span>{fillTemplate(t.pacCompleteCount, { n: s.completeCount })}</span>
                              </p>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                <Badge tone={s.current ? "success" : "neutral"} dot>
                                  {s.current ? t.pacCurrent : t.pacSuperseded}
                                </Badge>
                                <Badge tone={s.includeInLearning ? "info" : "warning"}>{s.includeInLearning ? t.pacLearningOn : t.pacLearningOff}</Badge>
                              </div>
                            </div>
                            <div className="flex shrink-0 flex-wrap gap-2">
                              <Button size="sm" variant="ghost" aria-expanded={expanded} aria-controls={expanded ? `pac-items-${s.id}` : undefined} aria-describedby={snapshotHeadingId(s.id)} onClick={() => setOpen(expanded ? null : s.id)}>
                                {expanded ? t.pacItemsHide : t.pacItemsShow}
                              </Button>
                              {canFinalize && s.current && (
                                <Button size="sm" variant="secondary" aria-disabled={busy || undefined} aria-describedby={snapshotHeadingId(s.id)} onClick={() => !busy && setSwitchingId(s.id)}>
                                  {s.includeInLearning ? t.pacLearningTurnOff : t.pacLearningTurnOn}
                                </Button>
                              )}
                            </div>
                          </div>
                          {expanded && (
                            <div id={`pac-items-${s.id}`} className="mt-4">
                              <SnapshotItems projectId={projectId} snapshotId={s.id} dateLabel={formatDateTime(s.finalizedAt, language)} />
                            </div>
                          )}
                        </article>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            <AttributesEditor projectId={projectId} />
          </>
        )
      )}

      {switching && (
        <LearningSwitchDialog key={`${switching.id}:${switching.version}`} snapshot={switching} label={dateLabel(switching)} busy={busy} onClose={() => setSwitchingId(null)} onSubmit={(reason) => void switchLearning(switching, reason)} />
      )}
    </div>
  )
}
