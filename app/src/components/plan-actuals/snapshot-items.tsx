"use client"

import { useId } from "react"
import { Badge, Button, EmptyState, SkeletonTable } from "@/components/ui"
import { useApiQuery } from "@/hooks"
import { fillTemplate } from "@/lib/fill-template"
import { useLanguage } from "@/lib/language-context"
import type { SnapshotItemView } from "./types"

interface Props {
  projectId: string
  snapshotId: string
  /** The finalized date (the caption says what the table lists). */
  dateLabel: string
}

/**
 * The frozen leaves of one snapshot: role (never the owner), baseline / actual days, end slip, wait and on-hold days,
 * and whether the leaf is used for learning. A data table may scroll sideways on a phone (WCAG 1.4.10 exception);
 * the scroll region is named by the table's caption.
 */
export function SnapshotItems({ projectId, snapshotId, dateLabel }: Props) {
  const { t, language } = useLanguage()
  const captionId = useId()
  const { data, isLoading, error, refetch } = useApiQuery<{ items: SnapshotItemView[] }>(`/api/projects/${projectId}/plan/actuals/${snapshotId}`)
  const fmt = new Intl.NumberFormat(language === "id" ? "id-ID" : language === "en" ? "en-US" : "ja-JP", { signDisplay: "auto" })
  const days = (n: number | null) => (n === null ? t.pacNone : fillTemplate(t.pacDays, { n: fmt.format(n) }))
  const slip = (n: number | null) => (n === null ? t.pacNone : fillTemplate(t.pacDays, { n: n > 0 ? `+${fmt.format(n)}` : fmt.format(n) }))
  if (isLoading && !data) return <SkeletonTable label={t.loading} />
  if (error && !data) return <EmptyState compact headingLevel={4} title={t.pacItemsLoadFailed} action={<Button size="sm" onClick={() => void refetch()}>{t.errorRetry}</Button>} />
  const items = data?.items ?? []
  if (items.length === 0) return <EmptyState compact headingLevel={4} title={t.pacItemsEmpty} />
  return (
    <div className="overflow-x-auto rounded-ui-lg border border-border" role="region" aria-labelledby={captionId} tabIndex={0}>
      <table className="w-full min-w-[40rem] text-body tabular-nums">
        <caption id={captionId} className="sr-only">
          {fillTemplate(t.pacItemsCaption, { date: dateLabel })}
        </caption>
        <thead className="bg-surface-sunken text-left text-caption text-fg-muted">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">{t.pacColName}</th>
            <th scope="col" className="px-3 py-2 font-medium">{t.pacColRole}</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">{t.pacColPlanned}</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">{t.pacColActual}</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">{t.pacColSlip}</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">{t.pacColWait}</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">{t.pacColOnHold}</th>
            <th scope="col" className="px-3 py-2 font-medium">{t.pacColLearnable}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((it) => (
            <tr key={it.id} className={it.complete ? undefined : "text-fg-muted"}>
              <th scope="row" className="px-3 py-2 text-left font-medium text-fg [overflow-wrap:anywhere]">
                {it.name}
              </th>
              <td className="px-3 py-2">{it.role ?? t.pacNone}</td>
              <td className="px-3 py-2 text-right">{days(it.plannedDays)}</td>
              <td className="px-3 py-2 text-right">{days(it.actualDays)}</td>
              <td className="px-3 py-2 text-right">{slip(it.endSlipDays)}</td>
              <td className="px-3 py-2 text-right">{days(it.waitGapDays)}</td>
              <td className="px-3 py-2 text-right">{days(it.onHoldDays)}</td>
              <td className="px-3 py-2">
                <Badge tone={it.complete ? "success" : "neutral"} dot>
                  {it.complete ? t.pacYes : t.pacNo}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
