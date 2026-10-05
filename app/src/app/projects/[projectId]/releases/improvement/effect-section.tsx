"use client"

import { Gauge } from "lucide-react"
import { Field, Input, Select } from "@/components/ui"
import { METRIC_CATEGORIES, METRIC_NAME_MAX, METRIC_UNIT_MAX } from "@/lib/improvement/constants"
import { categoryLabel, formatRate } from "@/lib/improvement/labels"
import { achievementRate, isWorsened, targetContradictsDirection } from "@/lib/improvement/metrics"
import { useLanguage } from "@/lib/language-context"
import { invalidNumberFields, parseNumberText, type ImprovementForm, type NumberField } from "./improvement-types"
import { SectionFrame } from "./section-frame"

interface Props {
  form: ImprovementForm
  readOnly: boolean
  onChange: <K extends keyof ImprovementForm>(key: K, value: ImprovementForm[K]) => void
}

/** 効果: metric category / name / unit / better direction, before / target / after, money effect. */
export function EffectSection({ form, readOnly, onChange }: Props) {
  const { t } = useLanguage()
  const invalid = new Set(invalidNumberFields(form))
  const values = {
    direction: form.direction,
    baselineValue: numberOrNull(form.baselineValue),
    targetValue: numberOrNull(form.targetValue),
    resultValue: numberOrNull(form.resultValue),
  }
  const contradicts = targetContradictsDirection(values.direction, values.baselineValue, values.targetValue)
  const rate = achievementRate(values)

  const numberField = (key: NumberField, label: string, hint?: string) => (
    <Field label={label} hint={hint} error={invalid.has(key) ? t.kzNumberInvalid : undefined}>
      <Input inputMode="decimal" value={form[key]} readOnly={readOnly} onChange={(e) => onChange(key, e.target.value)} className="tabular-nums" />
    </Field>
  )

  return (
    <SectionFrame title={t.kzSectionEffect} icon={<Gauge aria-hidden="true" className="h-5 w-5 text-primary" />}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t.kzMetricCategory}>
          <Select value={form.metricCategory} disabled={readOnly} onChange={(e) => onChange("metricCategory", e.target.value)}>
            <option value="">{t.kzCatNone}</option>
            {METRIC_CATEGORIES.map((c) => (
              <option key={c} value={c}>{categoryLabel(c, t)}</option>
            ))}
          </Select>
        </Field>
        <Field label={t.kzDirection}>
          <Select value={form.direction} disabled={readOnly} onChange={(e) => onChange("direction", e.target.value)}>
            <option value="decrease">{t.kzDirDecrease}</option>
            <option value="increase">{t.kzDirIncrease}</option>
          </Select>
        </Field>
        <Field label={t.kzMetricName}>
          <Input value={form.metricName} maxLength={METRIC_NAME_MAX} readOnly={readOnly} placeholder={t.kzMetricNamePlaceholder} onChange={(e) => onChange("metricName", e.target.value)} />
        </Field>
        <Field label={t.kzMetricUnit}>
          <Input value={form.metricUnit} maxLength={METRIC_UNIT_MAX} readOnly={readOnly} placeholder={t.kzMetricUnitPlaceholder} onChange={(e) => onChange("metricUnit", e.target.value)} />
        </Field>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 sm:gap-3">
        {numberField("baselineValue", t.kzBefore)}
        {numberField("targetValue", t.kzTarget)}
        {numberField("resultValue", t.kzAfter)}
      </div>
      {contradicts && <p className="mt-2 rounded-ui-sm bg-warning-soft px-3 py-2 text-caption text-warning-strong">{t.kzTargetDirectionWarn}</p>}
      {rate !== null && !contradicts && (
        <p className="mt-2 text-body text-fg">
          {t.kzAchievement}: <span className={`font-bold tabular-nums ${isWorsened(values) ? "text-danger" : ""}`}>{isWorsened(values) ? t.kzWorsened : formatRate(rate)}</span>
        </p>
      )}
      <div className="mt-3 sm:max-w-xs">{numberField("annualEffectYen", t.kzAnnualEffect, t.kzAnnualEffectHint)}</div>
    </SectionFrame>
  )
}

function numberOrNull(text: string): number | null {
  const v = parseNumberText(text)
  return v === null || Number.isNaN(v) ? null : v
}
