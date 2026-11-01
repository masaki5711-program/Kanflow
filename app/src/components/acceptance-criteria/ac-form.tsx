"use client"

import { useId, useState, type FormEvent } from "react"
import { Button, Field, Select, Textarea } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { AC_EVIDENCE_KINDS, evidenceLabel } from "./ac-evidence"

export interface AcDto {
  /** Display id, e.g. PBI-12/AC-2. */
  id: string
  seq: number
  given: string | null
  when: string | null
  then: string | null
  text: string | null
  evidenceKind: string | null
}

export interface AcFormValues {
  given: string
  when: string
  then: string
  text: string
  evidenceKind: string
}

export const EMPTY_AC_FORM: AcFormValues = { given: "", when: "", then: "", text: "", evidenceKind: "" }

export function toAcForm(ac: AcDto): AcFormValues {
  return { given: ac.given ?? "", when: ac.when ?? "", then: ac.then ?? "", text: ac.text ?? "", evidenceKind: ac.evidenceKind ?? "" }
}

/** Pure: form → request body ("" = clear / not set). */
export function toAcBody(v: AcFormValues) {
  return { given: v.given.trim() || null, when: v.when.trim() || null, then: v.then.trim() || null, text: v.text.trim() || null, evidenceKind: v.evidenceKind || null }
}

export function hasAcContent(v: AcFormValues): boolean {
  return [v.given, v.when, v.then, v.text].some((s) => s.trim() !== "")
}

interface Props {
  initial: AcFormValues
  saving: boolean
  /** Heading for screen readers, e.g. "Edit PBI-12/AC-2" or "Add acceptance criterion". */
  legend: string
  onSubmit: (values: AcFormValues) => void
  onCancel: () => void
}

/** Given / When / Then are optional; the free text is the fallback; one of the four is required. */
export function AcForm({ initial, saving, legend, onSubmit, onCancel }: Props) {
  const { t } = useLanguage()
  const [v, setV] = useState(initial)
  const [touched, setTouched] = useState(false)
  const hintId = useId()
  const missing = touched && !hasAcContent(v)
  const set = (k: keyof AcFormValues) => (e: { target: { value: string } }) => setV((p) => ({ ...p, [k]: e.target.value }))

  function submit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (hasAcContent(v)) onSubmit(v)
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-ui-md border border-border bg-surface-muted p-3" aria-label={legend} noValidate>
      <p id={hintId} className="text-caption text-fg-muted">{t.pbiAcStructuredHint}</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Field label={t.pbiAcGiven}>
          <Textarea rows={2} value={v.given} onChange={set("given")} maxLength={2000} disabled={saving} />
        </Field>
        <Field label={t.pbiAcWhen}>
          <Textarea rows={2} value={v.when} onChange={set("when")} maxLength={2000} disabled={saving} />
        </Field>
        <Field label={t.pbiAcThen}>
          <Textarea rows={2} value={v.then} onChange={set("then")} maxLength={2000} disabled={saving} />
        </Field>
      </div>
      <Field label={t.pbiAcText} hint={t.pbiAcTextHint} error={missing ? t.pbiAcContentRequired : undefined}>
        <Textarea rows={2} value={v.text} onChange={set("text")} maxLength={2000} disabled={saving} />
      </Field>
      <Field label={t.pbiAcEvidence}>
        <Select value={v.evidenceKind} onChange={set("evidenceKind")} disabled={saving}>
          <option value="">{t.pbiAcEvidenceNone}</option>
          {AC_EVIDENCE_KINDS.map((k) => (
            <option key={k} value={k}>{evidenceLabel(t, k)}</option>
          ))}
        </Select>
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={saving}>{t.cancel}</Button>
        <Button type="submit" size="sm" loading={saving}>{t.save}</Button>
      </div>
    </form>
  )
}
