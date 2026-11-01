"use client"

import { fillTemplate } from "@/lib/fill-template"
import { useLanguage } from "@/lib/language-context"
import type { MetricsView } from "./feedback-types"
import { stateLabel } from "./lesson-parts"

const percent = (r: number | null): string | null => (r === null ? null : `${Math.round(r * 1000) / 10}%`)

/** The dashboard of the feedback loop (curators): recurrence, time to resolve with / without a lesson, systemized share, top failures. */
export function MetricsPanel({ metrics }: { metrics: MetricsView }) {
  const { t } = useLanguage()
  const none = t.feedbackMetricNone
  const minutes = (n: number | null, count: number) => (n === null ? none : fillTemplate(t.feedbackMetricMinutes, { n: String(n), count: String(count) }))
  const cells: Array<[string, string]> = [
    [t.feedbackMetricReports, String(metrics.reports)],
    [t.feedbackMetricRecurrence, percent(metrics.recurrenceRate) ?? none],
    [t.feedbackMetricResolveWith, minutes(metrics.resolveMinutes.withLesson, metrics.resolveMinutes.withLessonCount)],
    [t.feedbackMetricResolveWithout, minutes(metrics.resolveMinutes.withoutLesson, metrics.resolveMinutes.withoutLessonCount)],
    [t.feedbackMetricSystemized, percent(metrics.systemizedRate) ?? none],
  ]
  return (
    <section aria-label={fillTemplate(t.feedbackMetricsTitle, { days: String(metrics.windowDays) })} className="space-y-3" data-feedback-metrics="">
      <h2 className="text-body font-semibold text-fg">{fillTemplate(t.feedbackMetricsTitle, { days: String(metrics.windowDays) })}</h2>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {cells.map(([label, value]) => (
          <div key={label} className="rounded-ui-md border border-border bg-surface px-3 py-2">
            <dt className="text-caption text-fg-muted">{label}</dt>
            <dd className="text-body-lg font-semibold text-fg">{value}</dd>
          </div>
        ))}
      </dl>
      {metrics.top.length > 0 && (
        <div>
          <h3 className="mb-1 text-caption font-medium text-fg-muted">{t.feedbackTopFailures}</h3>
          <ol className="space-y-1">
            {metrics.top.map((f) => (
              <li key={f.signature} className="flex flex-wrap items-baseline gap-x-2 text-body text-fg">
                <span className="font-mono text-caption text-fg-muted">{fillTemplate(t.feedbackTopCount, { n: String(f.count) })}</span>
                <span className="min-w-0 break-words">{f.errorCode ? `${f.errorCode} ` : ""}{f.signatureText.split("\n")[0] || f.tool}</span>
                <span className="text-caption text-fg-subtle">{f.lessonState ? stateLabel(f.lessonState, t) : t.feedbackNoLesson}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  )
}
