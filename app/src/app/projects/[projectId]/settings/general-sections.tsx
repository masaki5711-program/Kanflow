"use client"

import { cn, useToast } from "@/components/ui"
import { apiFetch, useApiMutation } from "@/hooks"
import { type Language, languageLabels } from "@/lib/i18n"
import { useLanguage } from "@/lib/language-context"
import { type ProjectType, projectTypeOptions } from "@/lib/project-type-labels"
import { SettingsCard } from "./settings-card"

const PROJECT_TYPE_ICON: Record<string, string> = {
  software: "💻",
  process_improvement: "🏭",
}

export function LanguageSection() {
  const { t, language, setLanguage } = useLanguage()
  return (
    <SettingsCard title={t.settingsLanguage}>
      <div role="group" aria-label={t.settingsLanguageLabel}>
        <p className="mb-2 text-body font-medium text-fg">{t.settingsLanguageLabel}</p>
        <div className="flex flex-wrap gap-3">
          {(Object.keys(languageLabels) as Language[]).map((lang) => {
            const active = language === lang
            return (
              <button
                key={lang}
                type="button"
                aria-pressed={active}
                onClick={() => setLanguage(lang)}
                className={cn(
                  "min-h-9 rounded-ui-sm border px-4 py-2 text-body font-medium transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-fg"
                    : "border-border-strong bg-surface text-fg hover:bg-surface-muted",
                )}
              >
                {languageLabels[lang]}
              </button>
            )
          })}
        </div>
      </div>
    </SettingsCard>
  )
}

export function TranslationInfoSection() {
  const { t } = useLanguage()
  return (
    <SettingsCard
      title={
        <>
          <span aria-hidden="true">🌐</span> {t.settingsTranslationTitle}
        </>
      }
    >
      <p className="text-body text-fg-muted">{t.settingsTranslationDesc}</p>
      <p className="mt-2 text-caption text-fg-muted">{t.glossaryHint}</p>
    </SettingsCard>
  )
}

export function ProjectTypeSection({ projectId }: { projectId: string }) {
  const { t, language, projectType, setProjectType } = useLanguage()
  const toast = useToast()

  const change = useApiMutation(
    (newType: ProjectType) =>
      apiFetch(`/api/projects/${projectId}`, { method: "PATCH", json: { projectType: newType } }),
    {
      onSuccess: (_r, newType) => setProjectType(newType),
      onError: () => toast.error(t.settingsProjectTypeChangeFailed),
    },
  )

  return (
    <SettingsCard title={t.projectType}>
      <div role="group" aria-label={t.projectType} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {projectTypeOptions.map((opt) => {
          const label = language === "ja" ? opt.labelJa : language === "id" ? opt.labelId : opt.labelEn
          const desc = language === "ja" ? opt.descJa : language === "id" ? opt.descId : opt.descEn
          const isSelected = projectType === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={isSelected}
              onClick={() => change.mutate(opt.value)}
              disabled={change.isPending}
              className={cn(
                "rounded-ui-sm border-2 p-4 text-left transition-colors disabled:opacity-50",
                isSelected ? "border-primary bg-primary-soft" : "border-border hover:border-border-strong hover:bg-surface-muted",
              )}
            >
              <span aria-hidden="true" className="mb-1 block text-2xl">
                {PROJECT_TYPE_ICON[opt.value] ?? "📋"}
              </span>
              <span className={cn("block text-body font-medium", isSelected ? "text-primary-active" : "text-fg")}>
                {label}
              </span>
              <span className="mt-1 block text-caption text-fg-muted">{desc}</span>
            </button>
          )
        })}
      </div>
    </SettingsCard>
  )
}
