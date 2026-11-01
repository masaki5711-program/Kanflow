"use client"

import { useApiQuery } from "@/hooks"
import { fillTemplate } from "@/lib/fill-template"
import { formatDateTime } from "@/lib/format-date"
import { useLanguage } from "@/lib/language-context"
import { parseHistory, type FailureHistoryView } from "./feedback-types"

/** Failure history of a lesson's signature (curators): newest first, with how each was fixed. */
export function LessonHistory({ lessonId }: { lessonId: string }) {
  const { t, language } = useLanguage()
  const { data, error } = useApiQuery<FailureHistoryView[]>(`/api/feedback/lessons/${lessonId}`, { parse: parseHistory })
  if (!data && error) return <p role="alert" className="text-caption text-fg-muted">{t.feedbackHistoryLoadFailed}</p>
  if (!data) return null
  if (data.length === 0) return <p className="text-caption text-fg-subtle">{t.feedbackHistoryEmpty}</p>
  return (
    <ul className="space-y-1.5" aria-label={t.feedbackHistory} data-lesson-history="">
      {data.map((f) => (
        <li key={f.id} className="rounded-ui-sm border border-border px-2 py-1.5 text-caption">
          <p className="flex flex-wrap gap-x-2 text-fg-muted">
            <span>{formatDateTime(f.createdAt, language)}</span>
            <span>{f.tool}{f.errorCode ? ` / ${f.errorCode}` : ""}</span>
            {f.projectName && <span>{f.projectName}</span>}
            {f.branch && <span className="font-mono">{f.branch}</span>}
            {f.repeatCount > 1 && <span>{fillTemplate(t.feedbackHistoryRepeat, { n: String(f.repeatCount) })}</span>}
          </p>
          <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words font-mono text-fg">{f.excerpt}</pre>
          {f.resolution && <p className="mt-1 text-fg">{fillTemplate(t.feedbackHistoryResolved, { summary: f.resolution.diffSummary })}</p>}
        </li>
      ))}
    </ul>
  )
}
