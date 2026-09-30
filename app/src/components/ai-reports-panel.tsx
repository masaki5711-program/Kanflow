"use client"

import { formatDateTime } from "@/lib/format-date"
import { useEffect, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Badge, Truncate } from "@/components/ui"
import { useApiQuery } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { ReportDocument, parseStructured } from "@/components/structured-report-document"
import { AiJobChip } from "@/components/ai-jobs/ai-job-chip"
import { AI_REPORTS_CHANGED_EVENT, type AiJobView } from "@/components/ai-jobs/ai-job-client"
import { useActiveAiJobs } from "@/components/ai-jobs/use-active-ai-jobs"
import { aiJobKindLabel } from "@/components/notifications/notification-format"
import { languageLabels, type Language } from "@/lib/i18n"
import { detectReportLang, localizeStructuredReport, pickBilingualLines, pickReportTitle } from "./ai-report-language"

interface AiReport {
  id: string
  trigger: string
  status: string
  title: string
  summary: string | null
  body: string | null
  structured: string | null
  createdAt: string
}

type Translations = ReturnType<typeof useLanguage>["t"]

const OLDER_LIST_ID = "ai-reports-older"
/** `?report=<id>` opens that report (links from the ai_report_ready notification). */
const REPORT_PARAM = "report"

function readReportParam(): string | null {
  if (typeof window === "undefined") return null
  return new URLSearchParams(window.location.search).get(REPORT_PARAM) || null
}

function toReports(raw: unknown): AiReport[] {
  return Array.isArray(raw) ? (raw as AiReport[]) : []
}

interface ReportRowProps {
  report: AiReport
  isOpen: boolean
  isLatest: boolean
  onToggle: () => void
  triggerLabel: string
  language: Language
  t: Translations
}

function ReportRow({ report: r, isOpen, isLatest, onToggle, triggerLabel, language, t }: ReportRowProps) {
  const parsed = isOpen ? parseStructured(r.structured) : null
  // Bilingual (JA/ID) reports show the viewer's side; single-language ones say which language they are in.
  const structured = parsed ? localizeStructuredReport(parsed, language) : null
  const sourceLang = detectReportLang(r.summary || r.body || "")
  const otherLanguage = sourceLang !== "bilingual" && sourceLang !== language ? sourceLang : null
  const title = pickReportTitle(r.title, language)
  const summary = r.summary ? pickBilingualLines(r.summary, language) : null
  const panelId = `ai-report-${r.id}`
  const hasBody = Boolean(r.structured || r.body)
  return (
    <li id={`ai-report-row-${r.id}`} className={isLatest ? "bg-violet-50/30" : undefined}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={hasBody ? isOpen : undefined}
        aria-controls={hasBody && isOpen ? panelId : undefined}
        className="w-full flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1 px-4 sm:px-6 py-3 text-left hover:bg-surface-muted"
      >
        <svg
          className={`w-4 h-4 text-fg-subtle flex-shrink-0 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
          viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"
        >
          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
        </svg>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            {isLatest && <Badge tone="primary" className="flex-shrink-0 mt-0.5">{t.aiReportLatest}</Badge>}
            <Truncate text={title} lines={2} className="text-body font-medium text-fg" />
          </div>
          {summary && !isOpen && (
            <Truncate text={summary} lines={1} className="text-caption text-fg-muted mt-0.5" />
          )}
        </div>
        <Badge tone="neutral" className="flex-shrink-0">{triggerLabel}</Badge>
        <span className="text-caption text-fg-muted flex-shrink-0">
          {formatDateTime(r.createdAt, language)}
        </span>
      </button>
      {isOpen && hasBody && (
        <div id={panelId} className="px-4 sm:px-6 pb-5 sm:pl-[52px]">
          {otherLanguage && (
            <p className="mb-2 text-caption text-fg-muted" data-testid="ai-report-language-note">
              {t.aiReportWrittenIn.replace("{language}", languageLabels[otherLanguage])}
            </p>
          )}
          {structured ? (
            <ReportDocument
              report={structured}
              trigger={triggerLabel}
              createdAt={formatDateTime(r.createdAt, language)}
              t={t}
            />
          ) : (
            <div className="bg-violet-50/40 border border-violet-100 rounded-ui-sm px-4 py-3 text-body text-fg leading-relaxed [&_h2]:text-body [&_h2]:font-bold [&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:first:mt-0 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1 [&_p]:my-1">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{pickBilingualLines(r.body ?? "", language)}</ReactMarkdown>
            </div>
          )}
        </div>
      )}
    </li>
  )
}

/**
 * Dashboard panel listing AI reports (surveillance / sprint-completion /
 * background progress reports) and the report jobs still in progress.
 * Read-only viewer. `?report=<id>` opens (and scrolls to) one report.
 *
 * The API returns the newest reports first (history is kept). Only the
 * newest one is marked "latest" and listed by default; older reports are
 * collapsed behind a toggle.
 *
 * Reports submitted through the submit_report tool carry a structured JSON
 * payload and are rendered as a formal report document (title block, meta
 * table, numbered sections). Legacy / plain-text reports fall back to the
 * markdown body.
 */
export default function AiReportsPanel({ projectId }: { projectId: string }) {
  const { t, language } = useLanguage()
  const { data: reports = [], refetch: refetchReports } = useApiQuery<AiReport[]>(`/api/projects/${projectId}/ai-reports`, {
    parse: toReports,
    toastOnError: () => t.aiReportLoadFailed,
  })
  // Deep link: the report named in the URL starts open (reports load after mount, so no SSR mismatch).
  const [linkedId] = useState(readReportParam)
  const [openId, setOpenId] = useState<string | null>(linkedId)
  // null = not toggled yet: older reports start expanded only when the linked report is among them.
  const [olderToggled, setOlderToggled] = useState<boolean | null>(null)
  const jobs = useActiveAiJobs(projectId, () => refetchReports?.())

  // A report finished on this page (dashboard button) → reload the list.
  useEffect(() => {
    const onChanged = () => refetchReports?.()
    window.addEventListener(AI_REPORTS_CHANGED_EVENT, onChanged)
    return () => window.removeEventListener(AI_REPORTS_CHANGED_EVENT, onChanged)
  }, [refetchReports])

  // …and is scrolled into view once it is listed.
  const scrolled = useRef(false)
  useEffect(() => {
    if (!linkedId || scrolled.current) return
    const el = document.getElementById(`ai-report-row-${linkedId}`)
    if (!el) return
    scrolled.current = true
    el.scrollIntoView?.({ block: "start" })
  }, [reports, linkedId])

  // Hide the panel entirely until the first report (or report job) exists —
  // keeps the dashboard uncluttered for projects where surveillance hasn't fired yet.
  if (reports.length === 0 && jobs.length === 0) return null

  const triggerLabel: Record<string, string> = {
    surveillance: t.aiReportTriggerSurveillance,
    sprint_completed: t.aiReportTriggerSprintCompleted,
    manual: t.aiReportTriggerProgress,
  }
  const [latest, ...older] = reports
  const showOlder = olderToggled ?? (linkedId !== null && older.some((r) => r.id === linkedId))
  const row = (r: AiReport, isLatest: boolean) => (
    <ReportRow
      key={r.id}
      report={r}
      isLatest={isLatest}
      isOpen={openId === r.id}
      onToggle={() => setOpenId(openId === r.id ? null : r.id)}
      triggerLabel={triggerLabel[r.trigger] ?? r.trigger}
      language={language}
      t={t}
    />
  )

  return (
    <section aria-labelledby="ai-reports-heading" className="bg-surface rounded-ui-md shadow-ui-sm border border-border overflow-hidden">
      <div className="border-l-4 border-l-violet-500 px-4 sm:px-6 py-4">
        <div className="flex items-center gap-2.5">
          <span className="text-xl" aria-hidden="true">🤖</span>
          <h2 id="ai-reports-heading" className="text-body-lg font-semibold text-fg">{t.aiReportsTitle}</h2>
          <Badge tone="primary">{reports.length}</Badge>
        </div>
      </div>
      {jobs.length > 0 && <JobsInProgress jobs={jobs} t={t} />}
      {latest && <ul className="divide-y divide-border border-t border-border">{row(latest, true)}</ul>}
      {older.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setOlderToggled(!showOlder)}
            aria-expanded={showOlder}
            aria-controls={showOlder ? OLDER_LIST_ID : undefined}
            className="w-full px-4 sm:px-6 py-2 text-left text-caption font-medium text-fg-muted border-t border-border hover:bg-surface-muted hover:text-fg"
          >
            {showOlder ? t.aiReportOlderHide : t.aiReportOlderShow.replace("{count}", String(older.length))}
          </button>
          {showOlder && (
            <ul id={OLDER_LIST_ID} className="divide-y divide-border border-t border-border">
              {older.map((r) => row(r, false))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}

/** Report jobs still queued / running (background progress reports, sprint reviews). */
function JobsInProgress({ jobs, t }: { jobs: AiJobView[]; t: Translations }) {
  return (
    <div className="border-t border-border px-4 sm:px-6 py-3">
      <h3 className="mb-2 text-caption font-semibold text-fg-muted">{t.aiJobInProgressTitle}</h3>
      <ul className="space-y-1.5">
        {jobs.map((job) => (
          <li key={job.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-body text-fg">{aiJobKindLabel(job.kind, t)}</span>
            {job.requestedBy && (
              <span className="text-caption text-fg-muted">{t.aiJobRequestedBy.replace("{name}", job.requestedBy.name)}</span>
            )}
            <AiJobChip job={job} />
          </li>
        ))}
      </ul>
    </div>
  )
}
