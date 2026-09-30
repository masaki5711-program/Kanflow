"use client"

import type { StructuredReport, ReportSeverity, ActionPriority, FollowUpStatus } from "@/lib/report-tool"
import type { Translations } from "@/lib/i18n"

/**
 * Formal report document renderer shared by every AI reporting surface:
 * the dashboard AI-reports panel (surveillance / sprint-completion) and the
 * stakeholder progress-report modal. Renders a StructuredReport as a
 * paper-style document: title block, meta table, numbered sections,
 * severity/priority badges.
 *
 * Type-only imports from report-tool keep zod out of the client bundle.
 */

const SEVERITIES: ReportSeverity[] = ["info", "warning", "critical"]
const PRIORITIES: ActionPriority[] = ["high", "medium", "low"]
const FOLLOWUP_STATUSES: FollowUpStatus[] = ["resolved", "improved", "unresolved"]

/**
 * Defensive re-normalization of persisted/transferred JSON. Servers only
 * write payloads validated by parseSubmittedReport, but manual DB edits or
 * schema drift must degrade to the markdown fallback, not crash the UI.
 */
export function parseStructured(json: string | null): StructuredReport | null {
  if (!json) return null
  try {
    return normalizeStructured(JSON.parse(json))
  } catch {
    return null
  }
}

/** Same normalization for payloads that arrive already parsed (API JSON). */
export function normalizeStructured(value: unknown): StructuredReport | null {
  const v = value as Partial<StructuredReport> | null
  if (!v || typeof v.headline !== "string" || typeof v.overview !== "string") return null
  return {
    headline: v.headline,
    overview: v.overview,
    followUps: (Array.isArray(v.followUps) ? v.followUps : [])
      .filter((f) => f && typeof f.item === "string")
      .map((f) => ({
        status: FOLLOWUP_STATUSES.includes(f.status) ? f.status : "unresolved",
        item: f.item,
        note: typeof f.note === "string" ? f.note : null,
      })),
    findings: (Array.isArray(v.findings) ? v.findings : [])
      .filter((f) => f && typeof f.title === "string")
      .map((f) => ({
        severity: SEVERITIES.includes(f.severity) ? f.severity : "info",
        title: f.title,
        detail: typeof f.detail === "string" ? f.detail : null,
      })),
    metrics: (Array.isArray(v.metrics) ? v.metrics : [])
      .filter((m) => m && typeof m.label === "string" && typeof m.value === "string"),
    causes: (Array.isArray(v.causes) ? v.causes : []).filter((c) => typeof c === "string"),
    actions: (Array.isArray(v.actions) ? v.actions : [])
      .filter((a) => a && typeof a.action === "string")
      .map((a) => ({
        priority: PRIORITIES.includes(a.priority) ? a.priority : "medium",
        action: a.action,
      })),
    outlook: typeof v.outlook === "string" ? v.outlook : null,
  }
}

const SEVERITY_BADGE: Record<ReportSeverity, string> = {
  critical: "bg-red-100 text-red-700 border-red-200",
  warning: "bg-amber-100 text-amber-700 border-amber-200",
  info: "bg-emerald-100 text-emerald-700 border-emerald-200",
}

const PRIORITY_BADGE: Record<ActionPriority, string> = {
  high: "bg-red-50 text-red-600 border-red-200",
  medium: "bg-amber-50 text-amber-800 border-amber-200",
  low: "bg-gray-100 text-gray-700 border-gray-200",
}

const FOLLOWUP_BADGE: Record<FollowUpStatus, string> = {
  resolved: "bg-emerald-100 text-emerald-700 border-emerald-200",
  improved: "bg-amber-100 text-amber-700 border-amber-200",
  unresolved: "bg-red-100 text-red-700 border-red-200",
}

function followUpLabel(s: FollowUpStatus, t: Translations): string {
  return s === "resolved" ? t.aiReportFollowUpResolved
    : s === "improved" ? t.aiReportFollowUpImproved
    : t.aiReportFollowUpUnresolved
}

function severityLabel(s: ReportSeverity, t: Translations): string {
  return s === "critical" ? t.aiReportSeverityCritical
    : s === "warning" ? t.aiReportSeverityWarning
    : t.aiReportSeverityInfo
}

function priorityLabel(p: ActionPriority, t: Translations): string {
  return p === "high" ? t.aiReportPriorityHigh
    : p === "medium" ? t.aiReportPriorityMedium
    : t.aiReportPriorityLow
}

export function ReportDocument({ report, trigger, createdAt, t, docTitle }: {
  report: StructuredReport
  trigger: string
  createdAt: string
  t: Translations
  /** Document title in the header block; defaults to the generic "AI Investigation Report". */
  docTitle?: string
}) {
  // Computed inline (not imported from report-tool) so zod stays out of the
  // client bundle — this module only type-imports from report-tool.
  const overall: ReportSeverity = report.findings.some((f) => f.severity === "critical")
    ? "critical"
    : report.findings.some((f) => f.severity === "warning")
      ? "warning"
      : "info"

  // Number only the sections that actually have content.
  let sectionNo = 0
  const heading = (label: string) => {
    sectionNo++
    return (
      <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900 border-b border-gray-200 pb-1.5 mb-2.5 mt-5 first:mt-0">
        <span className="text-violet-600">{sectionNo}.</span>
        {label}
      </h3>
    )
  }

  return (
    <div className="bg-white border border-gray-300 rounded-lg shadow-sm overflow-hidden">
      {/* Title block */}
      <div className="border-b-2 border-gray-800 px-6 pt-5 pb-4 text-center">
        <p className="text-base font-bold tracking-widest text-gray-900">{docTitle ?? t.aiReportDocTitle}</p>
      </div>

      {/* Meta table */}
      <div className="px-6 py-3 border-b border-gray-200 bg-gray-50/60">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
          <dt className="font-medium text-fg-muted">{t.aiReportFieldDate}</dt>
          <dd className="text-gray-800">{createdAt}</dd>
          <dt className="font-medium text-fg-muted">{t.aiReportFieldTrigger}</dt>
          <dd className="text-gray-800">{trigger}</dd>
          <dt className="font-medium text-fg-muted">{t.aiReportFieldAuthor}</dt>
          <dd className="text-gray-800">{t.aiReportAuthorName}</dd>
          <dt className="font-medium text-fg-muted">{t.aiReportFieldSeverity}</dt>
          <dd>
            <span className={`inline-block text-caption font-semibold border px-2 py-0.5 rounded ${SEVERITY_BADGE[overall]}`}>
              {severityLabel(overall, t)}
            </span>
          </dd>
        </dl>
      </div>

      <div className="px-6 py-4 text-sm text-gray-800 leading-relaxed">
        {/* Headline */}
        <p className="font-semibold text-gray-900 bg-violet-50 border-l-4 border-violet-400 px-3 py-2 rounded-r mb-1 whitespace-pre-wrap">
          {report.headline}
        </p>

        {heading(t.aiReportSectionOverview)}
        <p className="whitespace-pre-wrap">{report.overview}</p>

        {/* List keys below are indices on purpose: the report streams in append-only
            and each item's text grows token by token, so content keys would remount. */}
        {(report.followUps ?? []).length > 0 && (
          <>
            {heading(t.aiReportSectionFollowUps)}
            <ul className="space-y-2">
              {report.followUps.map((f, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className={`text-caption font-semibold border px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${FOLLOWUP_BADGE[f.status]}`}>
                    {followUpLabel(f.status, t)}
                  </span>
                  <span className="min-w-0">
                    <span className="font-medium whitespace-pre-wrap block">{f.item}</span>
                    {f.note && <span className="text-gray-600 whitespace-pre-wrap block mt-0.5">{f.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {report.findings.length > 0 && (
          <>
            {heading(t.aiReportSectionFindings)}
            <ul className="space-y-2">
              {report.findings.map((f, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className={`text-caption font-semibold border px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${SEVERITY_BADGE[f.severity]}`}>
                    {severityLabel(f.severity, t)}
                  </span>
                  {/* block + pre-wrap: bilingual JA/ID reports carry line pairs in every field */}
                  <span className="min-w-0">
                    <span className="font-medium whitespace-pre-wrap block">{f.title}</span>
                    {f.detail && <span className="text-gray-600 whitespace-pre-wrap block mt-0.5">{f.detail}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {report.metrics.length > 0 && (
          <>
            {heading(t.aiReportSectionMetrics)}
            <div className="overflow-x-auto">
              <table className="w-full text-xs border border-gray-200">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left font-medium text-gray-600 border-b border-gray-200 px-3 py-1.5 w-1/2">{t.aiReportMetricLabel}</th>
                    <th className="text-left font-medium text-gray-600 border-b border-gray-200 px-3 py-1.5">{t.aiReportMetricValue}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.metrics.map((m, i) => (
                    <tr key={i} className="odd:bg-white even:bg-gray-50/50">
                      <td className="border-b border-gray-100 px-3 py-1.5 text-gray-600 whitespace-pre-wrap">{m.label}</td>
                      <td className="border-b border-gray-100 px-3 py-1.5 font-medium text-gray-800 whitespace-pre-wrap">{m.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {report.causes.length > 0 && (
          <>
            {heading(t.aiReportSectionCauses)}
            <ul className="list-disc pl-5 space-y-1">
              {report.causes.map((c, i) => <li key={i} className="whitespace-pre-wrap">{c}</li>)}
            </ul>
          </>
        )}

        {report.actions.length > 0 && (
          <>
            {heading(t.aiReportSectionActions)}
            <ol className="space-y-2">
              {report.actions.map((a, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="font-semibold text-fg-muted flex-shrink-0">{i + 1})</span>
                  <span className="flex-1 whitespace-pre-wrap">{a.action}</span>
                  <span className={`text-caption font-semibold border px-1.5 py-0.5 rounded flex-shrink-0 ${PRIORITY_BADGE[a.priority]}`}>
                    {priorityLabel(a.priority, t)}
                  </span>
                </li>
              ))}
            </ol>
          </>
        )}

        {report.outlook && (
          <>
            {heading(t.aiReportSectionOutlook)}
            <p className="whitespace-pre-wrap">{report.outlook}</p>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-2.5 border-t border-gray-200 bg-gray-50/60">
        <p className="text-caption text-fg-muted">{t.aiReportFooterNote}</p>
      </div>
    </div>
  )
}
