"use client"

import { useLanguage } from "@/lib/language-context"
import { apiFetch, useApiMutation, useApiQuery } from "@/hooks"
import { SkeletonLines } from "@/components/ui"
import type { Translations } from "@/lib/i18n"

export const PREFERENCES_URL = "/api/notifications/preferences"

interface Preference {
  type: string
  enabled: boolean
}

interface PreferencesBody {
  preferences: Preference[]
}

const TYPE_LABEL: Record<string, keyof Translations> = {
  assigned: "notifTypeAssigned",
  mentioned: "notifTypeMentioned",
  comment: "notifTypeComment",
  due_soon: "notifTypeDueSoon",
  overdue: "notifTypeOverdue",
  sprint_start: "notifTypeSprintStart",
  sprint_end: "notifTypeSprintEnd",
  surveillance_critical: "notifTypeSurveillance",
  ai_report_ready: "notifTypeAiReportReady",
  ai_report_failed: "notifTypeAiReportFailed",
  improvement_check_due: "notifTypeImprovementCheckDue",
}

/**
 * /me section: one switch per notification type (GET/PUT
 * /api/notifications/preferences). Each toggle saves at once, optimistically,
 * and rolls back with an error toast on failure.
 */
export function NotificationSettings() {
  const { t } = useLanguage()
  const { data, isLoading, mutate } = useApiQuery<PreferencesBody>(PREFERENCES_URL, { toastOnError: true })
  const save = useApiMutation(
    (p: Preference) => apiFetch<PreferencesBody>(PREFERENCES_URL, { method: "PUT", json: { preferences: [p] } }),
    {
      onMutate: (p) => {
        const previous = data
        mutate((cur) => cur && { preferences: cur.preferences.map((x) => (x.type === p.type ? { ...x, enabled: p.enabled } : x)) })
        return previous
      },
      rollback: (previous) => mutate(previous),
      onSuccess: (body) => mutate(body),
      toastOnError: () => t.notifSettingsFailed,
    },
  )

  return (
    <section aria-labelledby="profile-notifications" className="bg-surface rounded-ui-lg border border-border shadow-ui-sm p-6">
      <h2 id="profile-notifications" className="text-body font-semibold text-fg-muted uppercase tracking-wider mb-2">
        {t.notifSettingsTitle}
      </h2>
      <p className="text-caption text-fg-muted mb-4">{t.notifSettingsHint}</p>
      {isLoading || !data ? (
        <SkeletonLines lines={4} label={t.loading} />
      ) : (
        <ul className="divide-y divide-border">
          {data.preferences.map((p) => {
            const labelKey = TYPE_LABEL[p.type]
            const label = labelKey ? (t[labelKey] as string) : p.type
            return (
              <li key={p.type} className="flex items-center justify-between gap-4 py-2.5">
                <label htmlFor={`notif-pref-${p.type}`} className="text-body text-fg">
                  {label}
                </label>
                <input
                  id={`notif-pref-${p.type}`}
                  type="checkbox"
                  role="switch"
                  checked={p.enabled}
                  onChange={(e) => void save.mutate({ type: p.type, enabled: e.target.checked })}
                  className="h-5 w-5 shrink-0 cursor-pointer accent-primary"
                />
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
