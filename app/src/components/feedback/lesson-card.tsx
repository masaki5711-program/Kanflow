"use client"

import { useState } from "react"
import { apiFetch, useApiMutation } from "@/hooks"
import { Button, useConfirm, useOptionalToast } from "@/components/ui"
import { fillTemplate } from "@/lib/fill-template"
import { formatLongDate } from "@/lib/format-date"
import { useLanguage } from "@/lib/language-context"
import type { LessonView } from "./feedback-types"
import { LessonHistory } from "./lesson-history"
import { scopeLabel, StateBadge } from "./lesson-parts"
import { SystemizeForm, type SystemizeKind } from "./systemize-form"

interface Props {
  lesson: LessonView
  canCurate: boolean
  onChanged: () => void
}

function Detail({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  if (!value) return null
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 font-medium text-fg-muted">{label}</dt>
      <dd className={mono ? "min-w-0 whitespace-pre-wrap break-words font-mono" : "min-w-0 whitespace-pre-wrap break-words"}>{value}</dd>
    </div>
  )
}

/**
 * One lesson: state, scope, hits, last seen, the analysis (cause / fix / verify) and — for a curator —
 * confirm / retire / systemize and the failure history of the signature.
 */
export function LessonCard({ lesson, canCurate, onChanged }: Props) {
  const { t, language } = useLanguage()
  const confirm = useConfirm()
  const toast = useOptionalToast()
  const [systemizing, setSystemizing] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const url = `/api/feedback/lessons/${lesson.id}`
  const act = useApiMutation(
    ({ action, json }: { action: "confirm" | "retire" | "systemize"; json?: object }) => apiFetch(`${url}/${action}`, { method: "POST", json: json ?? {} }),
    {
      toastOnError: () => t.feedbackActionFailed,
      onSuccess: (_result, { action }) => {
        toast?.success(action === "confirm" ? t.feedbackConfirmed : action === "retire" ? t.feedbackRetired : t.feedbackSystemized)
        setSystemizing(false)
        onChanged()
      },
    },
  )
  const run = (action: "confirm" | "retire" | "systemize", json?: object) => void act.mutate({ action, json })

  async function onRetire() {
    const ok = await confirm({ title: t.feedbackRetireTitle, message: t.feedbackRetireMessage, confirmLabel: t.feedbackRetire, variant: "warning" })
    if (ok) run("retire")
  }

  const canConfirm = canCurate && (lesson.state === "draft" || lesson.state === "retired")
  const canRetire = canCurate && lesson.state !== "retired"
  const canSystemize = canCurate && lesson.state === "confirmed"
  const aria = { symptom: lesson.symptom.split("\n")[0].slice(0, 80) }

  return (
    <li className="space-y-2 rounded-ui-md border border-border bg-surface p-3" data-lesson-id={lesson.id}>
      <div className="flex flex-wrap items-center gap-2">
        <StateBadge state={lesson.state} t={t} />
        <span className="text-caption text-fg-muted">{scopeLabel(lesson.scope, t)}</span>
        {lesson.errorCode && <span className="rounded-ui-sm bg-surface-sunken px-1.5 py-0.5 font-mono text-caption text-fg-muted">{lesson.errorCode}</span>}
        {lesson.confidential && <span className="text-caption text-warning-hover">{t.feedbackConfidentialBadge}</span>}
        <span className="ml-auto flex flex-wrap gap-x-3 text-caption text-fg-muted">
          <span>{fillTemplate(t.feedbackHits, { n: String(lesson.hits) })}</span>
          <span>{fillTemplate(t.feedbackResolvedCount, { n: String(lesson.resolvedCount) })}</span>
          <span>{lesson.lastSeenAt ? fillTemplate(t.feedbackLastSeen, { date: formatLongDate(lesson.lastSeenAt, language) }) : t.feedbackNeverSeen}</span>
        </span>
      </div>
      <p className="whitespace-pre-wrap break-words text-body font-medium text-fg">{lesson.symptom}</p>
      <dl className="space-y-1 text-body text-fg">
        <Detail label={t.feedbackCause} value={lesson.cause} />
        <Detail label={t.feedbackFix} value={lesson.fix ?? t.feedbackNoFix} />
        <Detail label={t.feedbackVerify} value={lesson.verify} mono />
        <Detail label={t.feedbackEvidence} value={lesson.evidence.length > 0 ? lesson.evidence.join("\n") : null} />
      </dl>
      {lesson.systemizedRef && <p className="text-caption text-fg-muted">{fillTemplate(t.feedbackSystemizedRefLabel, { ref: lesson.systemizedRef })}</p>}
      {canCurate && (
        <div className="flex flex-wrap gap-2">
          {canConfirm && (
            <Button type="button" size="sm" loading={act.isPending} aria-label={fillTemplate(t.feedbackConfirmAria, aria)} onClick={() => run("confirm")}>
              {t.feedbackConfirm}
            </Button>
          )}
          {canSystemize && !systemizing && (
            <Button type="button" size="sm" variant="secondary" aria-label={fillTemplate(t.feedbackSystemizeAria, aria)} onClick={() => setSystemizing(true)}>
              {t.feedbackSystemize}
            </Button>
          )}
          {canRetire && (
            <Button type="button" size="sm" variant="ghost" loading={act.isPending} aria-label={fillTemplate(t.feedbackRetireAria, aria)} onClick={() => void onRetire()}>
              {t.feedbackRetire}
            </Button>
          )}
          <Button type="button" size="sm" variant="link" aria-expanded={showHistory} onClick={() => setShowHistory((v) => !v)}>
            {t.feedbackHistoryShow}
          </Button>
        </div>
      )}
      {systemizing && <SystemizeForm saving={act.isPending} onSubmit={(v: { kind: SystemizeKind; ref: string }) => run("systemize", v)} onCancel={() => setSystemizing(false)} />}
      {showHistory && <LessonHistory lessonId={lesson.id} />}
    </li>
  )
}
