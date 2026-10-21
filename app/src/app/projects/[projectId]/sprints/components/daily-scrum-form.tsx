"use client"

import { useState } from "react"
import { useLanguage } from "@/lib/language-context"
import { GlossaryHint } from "@/components/i18n-text"
import { Button, Field, Input, Textarea, cn } from "@/components/ui"

export interface DailyScrumDraft {
  date: string
  content: string
}

const MAX_LEN = 2000

interface Props {
  initial: DailyScrumDraft
  minDate: string
  maxDate: string
  submitLabel: string
  /** Resolves true when saved; the add form then resets itself. */
  onSubmit: (draft: DailyScrumDraft) => Promise<boolean>
  onCancel?: () => void
  resetOnSuccess?: boolean
  /** Fetches a text to start the note from (Git activity). Absent / resolves null = no draft button. */
  onDraft?: () => Promise<string | null>
  className?: string
}

/** Date + notes form used both for adding and for editing a Daily Scrum note. */
export default function DailyScrumForm({
  initial, minDate, maxDate, submitLabel, onSubmit, onCancel, resetOnSuccess = false, onDraft, className,
}: Props) {
  const { t } = useLanguage()
  const [draft, setDraft] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [drafting, setDrafting] = useState(false)

  async function handleDraft() {
    if (!onDraft || drafting) return
    setDrafting(true)
    const text = await onDraft()
    setDrafting(false)
    if (!text) return
    setDraft((d) => ({ ...d, content: (d.content ? `${d.content}

${text}` : text).slice(0, MAX_LEN) }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const content = draft.content.trim()
    if (!content || saving) return
    setSaving(true)
    const ok = await onSubmit({ date: draft.date, content })
    setSaving(false)
    if (ok && resetOnSuccess) setDraft(initial)
  }

  return (
    <form onSubmit={handleSubmit} className={cn("space-y-2", className)}>
      <div className="max-w-[12rem]">
        <Field label={t.sprintDailyScrumDatePlaceholder} required>
          <Input type="date" inputSize="sm" value={draft.date} min={minDate} max={maxDate} required
            onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
        </Field>
      </div>
      <Field label={t.sprintDailyScrumContentLabel} hint={`${draft.content.length} / ${MAX_LEN}`}>
        <Textarea value={draft.content} rows={8} maxLength={MAX_LEN} className="min-h-[160px]"
          placeholder={t.sprintDailyScrumContentPlaceholder}
          onChange={(e) => setDraft({ ...draft, content: e.target.value.slice(0, MAX_LEN) })} />
      </Field>
      <GlossaryHint />
      <div className="flex justify-end gap-2">
        {onDraft && <Button size="sm" variant="ghost" type="button" onClick={() => void handleDraft()} loading={drafting} className="mr-auto">{t.sprintUxGitDraft}</Button>}
        {onCancel && <Button size="sm" variant="secondary" onClick={onCancel} disabled={saving}>{t.cancel}</Button>}
        <Button size="sm" type="submit" loading={saving} disabled={!draft.content.trim()}>{submitLabel}</Button>
      </div>
    </form>
  )
}
