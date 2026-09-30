"use client"

import { useState, type FormEvent } from "react"
import { Button, EmptyState, Field, Input, SkeletonLines } from "@/components/ui"
import { apiFetch, useApiMutation, useApiQuery, useUnsavedChangesGuard } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { fillTemplate } from "@/lib/fill-template"
import {
  DEFAULT_SURVEILLANCE_SETTINGS,
  SURVEILLANCE_LIMITS,
  parseStoredSurveillanceSettings,
  type SurveillanceSettings,
} from "@/lib/surveillance-settings"
import { SettingsCard, SettingsSaveRow } from "./settings-card"

type NumericKey = keyof typeof SURVEILLANCE_LIMITS
type BoolKey = Exclude<keyof SurveillanceSettings, NumericKey>

/** Numbers are edited as text so an invalid entry can be shown instead of silently coerced. */
type Draft = Record<NumericKey, string> & Pick<SurveillanceSettings, BoolKey>

const NUMERIC_KEYS = Object.keys(SURVEILLANCE_LIMITS) as NumericKey[]

export function toDraft(s: SurveillanceSettings): Draft {
  return {
    enabled: s.enabled,
    checkDailyScrum: s.checkDailyScrum,
    notifyCritical: s.notifyCritical,
    stalledDays: String(s.stalledDays),
    stalledTasksThreshold: String(s.stalledTasksThreshold),
    dailyScrumSilentDays: String(s.dailyScrumSilentDays),
    overCapacityTolerancePct: String(s.overCapacityTolerancePct),
    sprintOverdueGraceDays: String(s.sprintOverdueGraceDays),
  }
}

/** Valid integer within the key's bounds, else null. */
export function parseBounded(key: NumericKey, raw: string): number | null {
  if (!/^\d+$/.test(raw.trim())) return null
  const n = Number(raw)
  const { min, max } = SURVEILLANCE_LIMITS[key]
  return n >= min && n <= max ? n : null
}

/** Draft → settings, or null while any number is invalid. */
export function fromDraft(d: Draft): SurveillanceSettings | null {
  const numbers: Partial<Record<NumericKey, number>> = {}
  for (const key of NUMERIC_KEYS) {
    const n = parseBounded(key, d[key])
    if (n === null) return null
    numbers[key] = n
  }
  return { enabled: d.enabled, checkDailyScrum: d.checkDailyScrum, notifyCritical: d.notifyCritical, ...(numbers as Record<NumericKey, number>) }
}

/** Response → complete settings (unknown / missing fields take the defaults). */
function toSettingsResponse(raw: unknown): { settings: SurveillanceSettings } {
  const settings = raw && typeof raw === "object" ? (raw as { settings?: unknown }).settings : undefined
  return { settings: parseStoredSurveillanceSettings(settings === undefined ? null : JSON.stringify(settings)) }
}

interface Props {
  projectId: string
}

/** Per-project AI surveillance thresholds (PO / admin only — the caller decides visibility). */
export function SurveillanceSection({ projectId }: Props) {
  const { t } = useLanguage()
  const query = useApiQuery<{ settings: SurveillanceSettings }>(`/api/projects/${projectId}/surveillance-settings`, {
    parse: toSettingsResponse,
    toastOnError: () => t.survLoadFailed,
  })

  return (
    <SettingsCard title={t.survTitle}>
      <p className="mb-4 text-caption text-fg-muted">{t.survHint}</p>
      {query.data ? (
        <SurveillanceForm key={JSON.stringify(query.data.settings)} projectId={projectId} initial={query.data.settings} />
      ) : query.isLoading ? (
        <SkeletonLines lines={4} label={t.loading} />
      ) : (
        <EmptyState
          compact
          title={t.survLoadFailed}
          action={
            <Button variant="secondary" onClick={query.refetch}>
              {t.errorRetry}
            </Button>
          }
        />
      )}
    </SettingsCard>
  )
}

function SurveillanceForm({ projectId, initial }: { projectId: string; initial: SurveillanceSettings }) {
  const { t } = useLanguage()
  const [saved, setSaved] = useState(() => toDraft(initial))
  const [draft, setDraft] = useState(saved)
  const isDirty = JSON.stringify(draft) !== JSON.stringify(saved)
  useUnsavedChangesGuard(isDirty)
  const parsed = fromDraft(draft)

  const save = useApiMutation(
    (body: SurveillanceSettings) =>
      apiFetch<{ settings: SurveillanceSettings }>(`/api/projects/${projectId}/surveillance-settings`, { method: "PUT", json: body }),
    {
      onSuccess: (r) => setSaved(toDraft(r.settings)),
      toastOnSuccess: t.settingsSaved,
      toastOnError: () => t.settingsSaveFailed,
    },
  )

  const update = (patch: Partial<Draft>) => setDraft((prev) => ({ ...prev, ...patch }))

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!isDirty || !parsed || save.isPending) return
    void save.mutate(parsed)
  }

  const numberField = (key: NumericKey, label: string, hint: string, disabled = false) => {
    const { min, max } = SURVEILLANCE_LIMITS[key]
    const invalid = parseBounded(key, draft[key]) === null
    return (
      <Field
        label={label}
        hint={fillTemplate(hint, { min, max })}
        error={invalid ? fillTemplate(t.survRangeError, { min, max }) : undefined}
      >
        <Input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          value={draft[key]}
          disabled={disabled}
          onChange={(e) => update({ [key]: e.target.value } as Partial<Draft>)}
        />
      </Field>
    )
  }

  const checkbox = (key: BoolKey, label: string) => (
    <label className="flex items-center gap-3 text-body text-fg">
      <input
        type="checkbox"
        role="switch"
        checked={draft[key]}
        onChange={(e) => update({ [key]: e.target.checked } as Partial<Draft>)}
        className="h-5 w-5 shrink-0 cursor-pointer accent-primary"
      />
      {label}
    </label>
  )

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {checkbox("enabled", t.survEnabled)}
      {!draft.enabled && <p className="text-caption text-warning">{t.survDisabledNote}</p>}
      <fieldset disabled={!draft.enabled} className="space-y-4 disabled:opacity-60">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {numberField("stalledDays", t.survStalledDays, t.survStalledDaysHint)}
          {numberField("stalledTasksThreshold", t.survStalledTasks, t.survStalledTasksHint)}
          {numberField("overCapacityTolerancePct", t.survOverCapacity, t.survOverCapacityHint)}
          {numberField("sprintOverdueGraceDays", t.survOverdueGrace, t.survOverdueGraceHint)}
        </div>
        {checkbox("checkDailyScrum", t.survCheckDailyScrum)}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {numberField("dailyScrumSilentDays", t.survDailyScrumDays, t.survDailyScrumDaysHint, !draft.checkDailyScrum)}
        </div>
        {checkbox("notifyCritical", t.survNotifyCritical)}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <SettingsSaveRow
          isDirty={isDirty}
          saving={save.isPending}
          disabled={!parsed}
          label={t.settingsSaveButton}
          unsavedLabel={t.settingsUnsavedChanges}
        />
        <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(toDraft(DEFAULT_SURVEILLANCE_SETTINGS))}>
          {t.survResetDefaults}
        </Button>
      </div>
    </form>
  )
}
