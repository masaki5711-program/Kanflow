"use client"

import { useState, type FormEvent } from "react"
import { Button, Field, Input, Select, cn } from "@/components/ui"
import { apiFetch, useApiMutation, useUnsavedChangesGuard } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { SettingsCard } from "./settings-card"
import type { SprintHistory, SprintSettings } from "./settings-types"

interface SprintWorkloadProps {
  projectId: string
  initialSettings: SprintSettings
  history: SprintHistory[]
}

const DURATION_DAYS = [1, 2, 3, 4] as const
const DURATION_WEEKS = [1, 2, 3, 4] as const

/** Picks the singular/plural template and fills "{count}". */
function countLabel(count: number, one: string, other: string): string {
  return (count === 1 ? one : other).replace("{count}", String(count))
}
const DAYS_PER_WEEK = 7

export function SprintWorkloadSection({ projectId, initialSettings, history }: SprintWorkloadProps) {
  const { t } = useLanguage()
  const [saved, setSaved] = useState(initialSettings)
  const [settings, setSettings] = useState(initialSettings)
  const isDirty = JSON.stringify(settings) !== JSON.stringify(saved)
  useUnsavedChangesGuard(isDirty)

  const save = useApiMutation(
    (body: SprintSettings) => apiFetch(`/api/projects/${projectId}`, { method: "PATCH", json: body }),
    {
      onSuccess: (_r, body) => setSaved(body),
      toastOnSuccess: t.settingsSaved,
      toastOnError: () => t.settingsSaveFailed,
    },
  )

  const update = (patch: Partial<SprintSettings>) => setSettings((prev) => ({ ...prev, ...patch }))

  function submit(e: FormEvent) {
    e.preventDefault()
    save.mutate(settings)
  }

  const avgActual =
    history.length > 0 ? Math.round(history.reduce((sum, s) => sum + s.actualScore, 0) / history.length) : null

  const durationOptions = [
    ...DURATION_DAYS.map((d) => ({ v: d, label: countLabel(d, t.settingsDay, t.settingsDays) })),
    ...DURATION_WEEKS.map((w) => ({ v: w * DAYS_PER_WEEK, label: countLabel(w, t.settingsWeek, t.settingsWeeks) })),
  ]

  return (
    <SettingsCard title={t.settingsSprintWorkload}>
      {avgActual !== null && (
        <div className="mb-4 rounded-ui-sm border border-info/30 bg-info-soft p-3">
          <p className="text-body text-info">
            {t.settingsAvgScore}: <strong>{avgActual}</strong> (
            {t.settingsSprintCount.replace("{count}", String(history.length))})
          </p>
          <p className="mt-1 text-caption text-info">{t.settingsAvgScoreHint}</p>
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t.settingsDefaultCapacity} hint={t.settingsDefaultCapacityHint}>
            <Input
              type="number"
              min={0}
              value={settings.defaultCapacity}
              onChange={(e) => update({ defaultCapacity: parseInt(e.target.value, 10) || 0 })}
            />
          </Field>
          <Field label={t.settingsSprintDuration}>
            <Select
              value={settings.sprintDurationDays}
              onChange={(e) => update({ sprintDurationDays: parseInt(e.target.value, 10) })}
            >
              {durationOptions.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.settingsPointUnit}>
            <Select value={settings.pointUnit} onChange={(e) => update({ pointUnit: e.target.value })}>
              <option value="SP">{t.pointUnitSP}</option>
              <option value="ポイント">{t.pointUnitPoints}</option>
              <option value="人日">{t.pointUnitManDay}</option>
              <option value="人時">{t.pointUnitManHour}</option>
            </Select>
          </Field>
          <Field label={t.settingsPointDescription}>
            <Input
              value={settings.pointDescription}
              onChange={(e) => update({ pointDescription: e.target.value })}
              placeholder={t.settingsPointDescriptionPlaceholder}
            />
          </Field>
        </div>
        <Button type="submit" loading={save.isPending}>
          {t.settingsSaveButton}
        </Button>
      </form>

      {history.length > 0 && <SprintHistoryTable history={history} />}
    </SettingsCard>
  )
}

function SprintHistoryTable({ history }: { history: SprintHistory[] }) {
  const { t } = useLanguage()
  return (
    <div className="mt-6 overflow-x-auto border-t border-border pt-4">
      <table className="w-full text-body">
        <caption className="mb-3 text-left text-body font-medium text-fg">{t.settingsSprintHistory}</caption>
        <thead>
          <tr className="border-b border-border text-left text-fg-muted">
            <th scope="col" className="pb-2 font-medium">{t.colSprint}</th>
            <th scope="col" className="pb-2 text-right font-medium">{t.colCapacity}</th>
            <th scope="col" className="pb-2 text-right font-medium">{t.colActualScore}</th>
            <th scope="col" className="pb-2 text-right font-medium">{t.colAchievementRate}</th>
            <th scope="col" className="pb-2 text-right font-medium">{t.colDiff}</th>
          </tr>
        </thead>
        <tbody>
          {history.map((s) => {
            const rate = s.capacity > 0 ? Math.round((s.actualScore / s.capacity) * 100) : 0
            const diff = s.actualScore - s.capacity
            return (
              <tr key={s.sprintName} className="border-b border-border">
                <th scope="row" className="py-2 text-left font-normal">{s.sprintName}</th>
                <td className="py-2 text-right">{s.capacity}</td>
                <td className="py-2 text-right">{s.actualScore}</td>
                <td className="py-2 text-right">{rate}%</td>
                <td
                  className={cn(
                    "py-2 text-right font-medium",
                    diff > 0 ? "text-success" : diff < 0 ? "text-danger" : "text-fg-muted",
                  )}
                >
                  {diff > 0 ? `+${diff}` : diff}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
