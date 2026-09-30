"use client"

import { useId, useState } from "react"
import { useLanguage } from "@/lib/language-context"
import { AIResultModal } from "@/components/ai-result-modal"
import { GlossaryHint, I18nText } from "@/components/i18n-text"
import { pickText } from "@/lib/translation/pick-text"
import { Badge, Button, Field, Modal, Textarea } from "@/components/ui"
import ModalCancelButton from "./modal-cancel-button"
import SprintCompletionSummary from "./sprint-completion-summary"
import type { RetroFields, Sprint, StatusDialogState } from "./types"

type KptField = "retrospectiveKeep" | "retrospectiveProblem" | "retrospectiveTry"

const KPT: { field: KptField; letter: string; box: string; title: string; dot: string }[] = [
  { field: "retrospectiveKeep", letter: "K", box: "bg-success-soft/60 border-success/30", title: "text-success-strong", dot: "bg-success" },
  { field: "retrospectiveProblem", letter: "P", box: "bg-danger-soft/60 border-danger/30", title: "text-danger-strong", dot: "bg-danger" },
  { field: "retrospectiveTry", letter: "T", box: "bg-info-soft/60 border-info/30", title: "text-info", dot: "bg-info" },
]

const RETRO_KEYS: (keyof RetroFields)[] = [
  "reviewComment", "retrospectiveMemo", "retrospectiveKeep", "retrospectiveProblem", "retrospectiveTry",
]

interface Props {
  projectId: string
  sprint: Sprint | undefined
  initial: StatusDialogState
  /** Saves the retro fields (and the status change). Resolves true on success. */
  onSubmit: (fields: RetroFields) => Promise<boolean>
  onClose: () => void
}

export default function SprintStatusDialog({ projectId, sprint, initial, onSubmit, onClose }: Props) {
  const { t, language } = useLanguage()
  const [fields, setFields] = useState<RetroFields>(() => ({
    reviewComment: initial.reviewComment,
    retrospectiveMemo: initial.retrospectiveMemo,
    retrospectiveKeep: initial.retrospectiveKeep,
    retrospectiveProblem: initial.retrospectiveProblem,
    retrospectiveTry: initial.retrospectiveTry,
  }))
  const [saving, setSaving] = useState(false)
  const kptHeadingId = useId()
  // The AI modal is a kit Modal stacked on top of this one (Esc closes only it).
  const [showRetroAI, setShowRetroAI] = useState(false)

  const statusLabels: Record<string, string> = {
    planning: t.sprintStatusPlanning, active: t.sprintStatusActive,
    review: t.sprintStatusReview, done: t.sprintStatusDone, archived: t.sprintStatusArchived,
  }
  const kptLabels: Record<KptField, { label: string; placeholder: string }> = {
    retrospectiveKeep: { label: t.sprintKptKeep, placeholder: t.sprintKptKeepPlaceholder },
    retrospectiveProblem: { label: t.sprintKptProblem, placeholder: t.sprintKptProblemPlaceholder },
    retrospectiveTry: { label: t.sprintKptTry, placeholder: t.sprintKptTryPlaceholder },
  }
  const isEditOnly = sprint?.status === initial.nextStatus
  const showRetroFields = initial.nextStatus === "review" || initial.nextStatus === "done"
  const hasLegacyReview = !!sprint?.reviewComment?.trim()
  const isDirty = RETRO_KEYS.some((k) => fields[k] !== initial[k])

  async function submit() {
    setSaving(true)
    const ok = await onSubmit(fields)
    setSaving(false)
    if (ok) onClose()
  }

  function appendAiToTry(text: string) {
    const header = t.sprintKptAiSuggestionHeader
    setFields((f) => ({ ...f, retrospectiveTry: f.retrospectiveTry ? `${f.retrospectiveTry}\n\n${header}\n${text}` : text }))
    setShowRetroAI(false)
  }

  const sprintName = pickText(sprint?.i18n, "sprintName", initial.sprintName, language).text || initial.sprintName
  const description = isEditOnly ? sprintName : (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="font-medium text-fg">{sprintName}</span>
      <span aria-hidden="true">→</span>
      <Badge tone="primary">{statusLabels[initial.nextStatus] ?? initial.nextStatus}</Badge>
    </span>
  )

  return (
    <>
      <Modal open onClose={onClose} size="xl" isDirty={isDirty && !saving}
        title={isEditOnly ? t.sprintRetrospectiveMemo : t.sprintReviewDialogTitle} description={description}
        footer={
          <>
            <ModalCancelButton disabled={saving} />
            <Button loading={saving} onClick={submit}>{isEditOnly ? t.save : t.sprintSubmitAndChangeStatus}</Button>
          </>
        }>
        <div className="space-y-6">
          {initial.nextStatus === "done" && !isEditOnly && sprint && <SprintCompletionSummary items={sprint.items} />}

          {hasLegacyReview && (
            <div className="bg-warning-soft border border-warning/30 rounded-ui-md px-4 py-3">
              <p className="text-caption font-semibold text-warning mb-1">
                {t.sprintReviewComment} ({t.sprintReviewLegacyReadOnly})
              </p>
              <I18nText as="p" i18n={sprint?.i18n} field="reviewComment" original={sprint?.reviewComment}
                entity={sprint ? { type: "sprint", id: sprint.id } : undefined} className="text-body text-fg whitespace-pre-wrap" />
            </div>
          )}

          {showRetroFields && (
            <section aria-labelledby={kptHeadingId}>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h3 id={kptHeadingId} className="flex items-center gap-2 text-body-lg font-semibold text-fg">
                  <span className="inline-block w-1.5 h-5 bg-primary rounded-sm" aria-hidden="true" />
                  {t.sprintRetrospectiveMemo} — KPT
                </h3>
                {sprint && (
                  <Button size="sm" variant="secondary" onClick={() => setShowRetroAI(true)}
                    leftIcon={<span aria-hidden="true">🤖</span>}>
                    {t.aiRetroSynthesis}
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {KPT.map(({ field, letter, box, title, dot }) => (
                  <div key={field} className={`border rounded-ui-md p-4 ${box}`}>
                    <Field label={
                      <span className={`flex items-center gap-2 font-bold ${title}`}>
                        <span aria-hidden="true" className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-caption ${dot}`}>{letter}</span>
                        {kptLabels[field].label}
                      </span>
                    }>
                      <Textarea value={fields[field]} rows={8} placeholder={kptLabels[field].placeholder}
                        className="text-body-lg leading-relaxed"
                        onChange={(e) => setFields((f) => ({ ...f, [field]: e.target.value }))} />
                    </Field>
                  </div>
                ))}
              </div>
              <GlossaryHint className="mt-2" />
            </section>
          )}

          {showRetroFields && (
            <Field label={t.sprintRetrospectiveOther}>
              <Textarea value={fields.retrospectiveMemo} rows={4} placeholder={t.sprintRetrospectiveOtherPlaceholder}
                onChange={(e) => setFields((f) => ({ ...f, retrospectiveMemo: e.target.value }))} />
            </Field>
          )}
        </div>
      </Modal>
      {showRetroAI && sprint && (
        <AIResultModal
          title={t.aiRetroTitle}
          fetchUrl={`/api/projects/${projectId}/sprints/${sprint.id}/ai/retro-synthesis`}
          fetchBody={{ lang: language }}
          onClose={() => setShowRetroAI(false)}
          footer={(text, done) =>
            done && text.trim() ? <Button size="sm" onClick={() => appendAiToTry(text)}>{t.aiAddToTry}</Button> : null
          }
        />
      )}
    </>
  )
}
