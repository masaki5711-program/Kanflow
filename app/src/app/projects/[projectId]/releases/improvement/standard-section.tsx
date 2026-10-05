"use client"

import { BookCheck, ExternalLink, NotebookPen } from "lucide-react"
import { Field, Input, Textarea } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import type { ImprovementForm } from "./improvement-types"
import { SectionFrame } from "./section-frame"

interface Props {
  form: ImprovementForm
  readOnly: boolean
  onChange: <K extends keyof ImprovementForm>(key: K, value: ImprovementForm[K]) => void
}

const isHttpUrl = (s: string) => /^https?:\/\/\S+$/i.test(s.trim())

/** 標準化: 標準書リンク (needed for 標準化済み) and the date it was standardized. */
export function StandardSection({ form, readOnly, onChange }: Props) {
  const { t } = useLanguage()
  return (
    <SectionFrame title={t.kzSectionStandard} icon={<BookCheck aria-hidden="true" className="h-5 w-5 text-primary" />}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
        <Field label={t.kzStandardLink} hint={t.kzStandardLinkHint}>
          <Input value={form.manualLink} readOnly={readOnly} placeholder="https://..." onChange={(e) => onChange("manualLink", e.target.value)} />
        </Field>
        <Field label={t.kzStandardizedAt}>
          <Input type="date" value={form.standardizedAt} readOnly={readOnly} onChange={(e) => onChange("standardizedAt", e.target.value)} />
        </Field>
      </div>
      {isHttpUrl(form.manualLink) && (
        <a href={form.manualLink.trim()} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-9 items-center gap-1 text-body text-primary-strong underline">
          <ExternalLink aria-hidden="true" className="h-4 w-4" />
          {t.kzOpenLink}
        </a>
      )}
    </SectionFrame>
  )
}

/** 改善オーナーメモ (the release item's poNote). */
export function MemoSection({ form, readOnly, onChange }: Props) {
  const { t } = useLanguage()
  return (
    <SectionFrame title={t.kzSectionMemo} icon={<NotebookPen aria-hidden="true" className="h-5 w-5 text-primary" />}>
      <Field label={t.kzSectionMemo} hideLabel>
        <Textarea rows={3} value={form.poNote} readOnly={readOnly} onChange={(e) => onChange("poNote", e.target.value)} className="resize-y" />
      </Field>
    </SectionFrame>
  )
}
