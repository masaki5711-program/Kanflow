"use client"

import { useState } from "react"
import { useApiQuery } from "@/hooks"
import { Field, Input, Select, EmptyState } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { LESSON_STATE_FILTERS, parseLessonList, parseMetrics, type LessonListView, type MetricsView } from "./feedback-types"
import { LessonCard } from "./lesson-card"
import { stateLabel } from "./lesson-parts"
import { MetricsPanel } from "./metrics-panel"

/** The Lessons screen (/feedback): filters, the dashboard (curators) and the lessons. */
export function LessonsView() {
  const { t } = useLanguage()
  const [q, setQ] = useState("")
  const [state, setState] = useState<string>("")
  const params = new URLSearchParams({ limit: "100" })
  if (q.trim()) params.set("q", q.trim())
  if (state) params.set("state", state)
  const list = useApiQuery<LessonListView>(`/api/feedback/lessons?${params}`, { parse: parseLessonList })
  const metrics = useApiQuery<MetricsView | null>("/api/feedback/metrics", { parse: parseMetrics })
  const data = list.data

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-heading font-semibold text-fg">{t.feedbackTitle}</h1>
        <p className="text-body text-fg-muted">{t.feedbackIntro}</p>
      </header>
      {metrics.data && <MetricsPanel metrics={metrics.data} />}
      <div className="grid gap-2 sm:grid-cols-[1fr_12rem]">
        <Field label={t.feedbackSearchLabel}>
          <Input type="search" value={q} maxLength={200} placeholder={t.feedbackSearchPlaceholder} onChange={(e) => setQ(e.target.value)} />
        </Field>
        <Field label={t.feedbackStateLabel}>
          <Select value={state} onChange={(e) => setState(e.target.value)}>
            {LESSON_STATE_FILTERS.map((s) => (
              <option key={s} value={s}>
                {s === "" ? t.feedbackStateAll : stateLabel(s, t)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {!data && list.error && <p role="alert" className="rounded-ui-sm bg-surface-muted px-2 py-1.5 text-body text-fg-muted">{t.feedbackLoadFailed}</p>}
      {data && data.lessons.length === 0 && <EmptyState title={t.feedbackEmpty} />}
      {data && data.lessons.length > 0 && (
        <ul className="space-y-2" aria-label={t.feedbackTitle}>
          {data.lessons.map((lesson) => (
            <LessonCard key={lesson.id} lesson={lesson} canCurate={data.curatable[lesson.id] === true} onChanged={list.refetch} />
          ))}
        </ul>
      )}
      {data?.truncated && <p className="text-caption text-fg-muted">{t.feedbackTruncated}</p>}
    </div>
  )
}
