"use client"

import { useState } from "react"
import { Button, Field, Input, Modal, Select, useModalClose } from "@/components/ui"
import { METRIC_NAME_MAX, METRIC_UNIT_MAX } from "@/lib/improvement/constants"
import { useLanguage } from "@/lib/language-context"
import { parseNumberText } from "./improvement-types"

const TITLE_MAX = 500

/** What POST /improvements takes. */
export interface NewImprovement {
  title: string
  metricName?: string
  metricUnit?: string
  direction: string
  baselineValue?: number
  targetValue?: number
}

interface Props {
  open: boolean
  saving: boolean
  onClose: () => void
  /** Resolves true when the improvement was created (the dialog then closes). */
  onCreate: (input: NewImprovement) => Promise<boolean>
}

/** Mounted only while open, so the form starts empty every time. */
export function AddImprovementDialog(props: Props) {
  if (!props.open) return null
  return <AddBody {...props} />
}

function AddBody({ saving, onClose, onCreate }: Props) {
  const { t } = useLanguage()
  const [title, setTitle] = useState("")
  const [metricName, setMetricName] = useState("")
  const [metricUnit, setMetricUnit] = useState("")
  const [direction, setDirection] = useState("decrease")
  const [baseline, setBaseline] = useState("")
  const [target, setTarget] = useState("")
  const baselineValue = parseNumberText(baseline)
  const targetValue = parseNumberText(target)
  const invalid = Number.isNaN(baselineValue) || Number.isNaN(targetValue)
  const canSubmit = title.trim() !== "" && !invalid

  async function submit() {
    if (!canSubmit) return
    const input: NewImprovement = { title: title.trim(), direction }
    if (metricName.trim()) input.metricName = metricName.trim()
    if (metricUnit.trim()) input.metricUnit = metricUnit.trim()
    if (baselineValue !== null) input.baselineValue = baselineValue
    if (targetValue !== null) input.targetValue = targetValue
    if (await onCreate(input)) onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t.kzAddDirectTitle}
      size="lg"
      isDirty={title !== "" || metricName !== "" || baseline !== "" || target !== ""}
      footer={<AddFooter disabled={!canSubmit} loading={saving} onSubmit={submit} />}
    >
      <div className="space-y-3">
        <Field label={t.kzFieldTitle} required>
          <Input value={title} maxLength={TITLE_MAX} placeholder={t.kzFieldTitlePlaceholder} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t.kzMetricName}>
            <Input value={metricName} maxLength={METRIC_NAME_MAX} placeholder={t.kzMetricNamePlaceholder} onChange={(e) => setMetricName(e.target.value)} />
          </Field>
          <Field label={t.kzMetricUnit}>
            <Input value={metricUnit} maxLength={METRIC_UNIT_MAX} placeholder={t.kzMetricUnitPlaceholder} onChange={(e) => setMetricUnit(e.target.value)} />
          </Field>
          <Field label={t.kzDirection}>
            <Select value={direction} onChange={(e) => setDirection(e.target.value)}>
              <option value="decrease">{t.kzDirDecrease}</option>
              <option value="increase">{t.kzDirIncrease}</option>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t.kzBefore} error={Number.isNaN(baselineValue) ? t.kzNumberInvalid : undefined}>
              <Input inputMode="decimal" value={baseline} onChange={(e) => setBaseline(e.target.value)} className="tabular-nums" />
            </Field>
            <Field label={t.kzTarget} error={Number.isNaN(targetValue) ? t.kzNumberInvalid : undefined}>
              <Input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} className="tabular-nums" />
            </Field>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function AddFooter({ disabled, loading, onSubmit }: { disabled: boolean; loading: boolean; onSubmit: () => void }) {
  const { t } = useLanguage()
  const close = useModalClose()
  return (
    <>
      <Button variant="secondary" onClick={close}>{t.cancel}</Button>
      <Button onClick={onSubmit} disabled={disabled} loading={loading}>{t.kzAddSubmit}</Button>
    </>
  )
}
