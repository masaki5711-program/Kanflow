"use client"

import { useState } from "react"
import { Button, Field, Input, Select } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"

export type SystemizeKind = "pbi" | "gate" | "test"

interface Props {
  saving: boolean
  onSubmit: (value: { kind: SystemizeKind; ref: string }) => void
  onCancel: () => void
}

/** The link to the PBI / gate / test that now guards against the failure (required to systemize). */
export function SystemizeForm({ saving, onSubmit, onCancel }: Props) {
  const { t } = useLanguage()
  const [kind, setKind] = useState<SystemizeKind>("pbi")
  const [ref, setRef] = useState("")
  const valid = ref.trim().length > 0
  return (
    <form
      className="space-y-2 rounded-ui-md border border-border bg-surface-muted p-3"
      aria-label={t.feedbackSystemizeTitle}
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) onSubmit({ kind, ref: ref.trim() })
      }}
    >
      <p className="text-caption text-fg-muted">{t.feedbackSystemizeHint}</p>
      <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
        <Field label={t.feedbackSystemizeKind}>
          <Select value={kind} onChange={(e) => setKind(e.target.value as SystemizeKind)}>
            <option value="pbi">{t.feedbackKindPbi}</option>
            <option value="gate">{t.feedbackKindGate}</option>
            <option value="test">{t.feedbackKindTest}</option>
          </Select>
        </Field>
        <Field label={t.feedbackSystemizeRef} required>
          <Input value={ref} maxLength={400} onChange={(e) => setRef(e.target.value)} />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={saving} disabled={!valid}>
          {t.feedbackSave}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {t.feedbackCancel}
        </Button>
      </div>
    </form>
  )
}
