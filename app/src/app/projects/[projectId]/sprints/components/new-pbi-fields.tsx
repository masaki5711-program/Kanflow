"use client"

import { GlossaryHint } from "@/components/i18n-text"
import { PbiReferenceField } from "@/components/pbi-form/attachments/pbi-reference-field"
import type { PbiAttachmentsController } from "@/components/pbi-form/attachments/types"
import { Field, Input, Textarea } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"

/** The "new PBI" tab of the add-PBI modal (a compact subset of the PBI form). */
export interface NewPbiForm {
  initiative: string
  epic: string
  userStory: string
  acceptanceCriteria: string
  workloadScore: string
  assignedPo: string
  referenceDoc: string
}

export const EMPTY_NEW: NewPbiForm = {
  initiative: "",
  epic: "",
  userStory: "",
  acceptanceCriteria: "",
  workloadScore: "3",
  assignedPo: "",
  referenceDoc: "",
}

export function isNewFormDirty(f: NewPbiForm): boolean {
  return (Object.keys(f) as (keyof NewPbiForm)[]).some((k) => f[k] !== EMPTY_NEW[k])
}

interface Props {
  form: NewPbiForm
  onChange: (f: NewPbiForm) => void
  pointUnit: string
  /** 参考資料 files queued until the PBI is created. */
  attachments?: PbiAttachmentsController
  disabled?: boolean
}

export function NewPbiFields({ form, onChange, pointUnit, attachments, disabled }: Props) {
  const { t, pt } = useLanguage()
  const set = (key: keyof NewPbiForm) => (e: { target: { value: string } }) => onChange({ ...form, [key]: e.target.value })
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={pt.backlogInitiative}>
          <Input value={form.initiative} onChange={set("initiative")} />
        </Field>
        <Field label={pt.backlogEpic}>
          <Input value={form.epic} onChange={set("epic")} />
        </Field>
      </div>
      <Field label={pt.backlogUserStory}>
        <Textarea value={form.userStory} onChange={set("userStory")} rows={4} className="resize-y" />
      </Field>
      <GlossaryHint className="-mt-2" />
      <Field label={pt.backlogAcceptanceCriteria}>
        <Textarea
          value={form.acceptanceCriteria}
          onChange={set("acceptanceCriteria")}
          rows={6}
          placeholder={t.backlogAcceptanceCriteriaPlaceholder}
          className="min-h-[160px] resize-y"
        />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={`${pt.backlogWorkloadScore} (${pointUnit})`}>
          <Input type="number" min={0} step={1} value={form.workloadScore} onChange={set("workloadScore")} />
        </Field>
        <Field label={pt.rolePO}>
          <Input value={form.assignedPo} onChange={set("assignedPo")} />
        </Field>
      </div>
      <PbiReferenceField
        value={form.referenceDoc}
        onChange={set("referenceDoc")}
        attachments={attachments}
        disabled={disabled}
      />
      <p className="text-caption text-fg-muted">{t.backlogAddPbiNewHint}</p>
    </div>
  )
}
