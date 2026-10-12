"use client"

import { SkeletonLines } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { skipReasonLabel, type ScheduleResult } from "../lib/schedule-api"
import { fillTemplate } from "../lib/template"

const PREVIEW_ROWS = 6

interface Props {
  result: ScheduleResult | null
  failed: boolean
  loading: boolean
  /** Headline for a non-empty preview, e.g. "5 件の日程が動きます". */
  summary: (moved: number) => string
  /** Shown when nothing would move. */
  emptyText: string
}

/** The what-would-change box of the scheduling dialogs: moved rows, then why others stay. */
export function PlanMovePreview({ result, failed, loading, summary, emptyText }: Props) {
  const { t } = useLanguage()
  const moved = result?.moved ?? []
  const skipped = result?.skipped ?? []
  return (
    <div aria-live="polite" className="rounded-ui-md border border-border p-3" data-testid="plan-move-preview">
      {failed ? (
        <p role="alert" className="text-body text-danger">{t.pscBulkFailed}</p>
      ) : !result || loading ? (
        <SkeletonLines lines={3} />
      ) : moved.length === 0 ? (
        <p className="text-body text-fg-muted">{emptyText}</p>
      ) : (
        <>
          <p className="text-body font-semibold text-fg">{summary(moved.length)}</p>
          <ul className="mt-2 space-y-1 text-caption text-fg-muted">
            {moved.slice(0, PREVIEW_ROWS).map((m) => (
              <li key={m.id} className="truncate">
                {m.name}: {m.plannedStart} → {m.newStart} <span aria-hidden="true">/</span> {m.plannedEnd} → {m.newEnd}
              </li>
            ))}
            {moved.length > PREVIEW_ROWS && <li>…</li>}
          </ul>
        </>
      )}
      {result && !loading && skipped.length > 0 && (
        <p className="mt-2 text-caption text-fg-muted" title={skipped.slice(0, 20).map((s) => `${s.name}: ${skipReasonLabel(t, s.reason)}`).join("\n")}>
          {fillTemplate(t.pscBulkSkipped, { n: skipped.length })}
        </p>
      )}
    </div>
  )
}
