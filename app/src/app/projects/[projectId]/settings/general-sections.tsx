"use client"

import { cn, useConfirm, useToast } from "@/components/ui"
import { apiFetch, useApiMutation } from "@/hooks"
import type { Language } from "@/lib/i18n"
import { useLanguage } from "@/lib/language-context"
import { type ProjectType, projectTypeOptions } from "@/lib/project-type-labels"
import { SettingsCard } from "./settings-card"

const PROJECT_TYPE_ICON: Record<string, string> = {
  software: "💻",
  process_improvement: "🏭",
  equipment: "🛠️",
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

type ProjectTypeOption = (typeof projectTypeOptions)[number]

function optionText(opt: ProjectTypeOption, language: Language): { label: string; desc: string } {
  if (language === "ja") return { label: opt.labelJa, desc: opt.descJa }
  if (language === "id") return { label: opt.labelId, desc: opt.descId }
  return { label: opt.labelEn, desc: opt.descEn }
}

/**
 * Project type switches every member's terminology, so it is confirmed first
 * and then saved immediately (a single explicit choice, no draft state).
 */
export function ProjectTypeSection({ projectId }: { projectId: string }) {
  const { t, language, projectType, setProjectType } = useLanguage()
  const toast = useToast()
  const confirm = useConfirm()

  const change = useApiMutation(
    (newType: ProjectType) =>
      apiFetch(`/api/projects/${projectId}`, { method: "PATCH", json: { projectType: newType } }),
    {
      onSuccess: (_r, newType) => setProjectType(newType),
      toastOnSuccess: t.settingsProjectTypeChanged,
      onError: () => toast.error(t.settingsProjectTypeChangeFailed),
    },
  )

  async function select(opt: ProjectTypeOption) {
    if (opt.value === projectType || change.isPending) return
    const ok = await confirm({
      title: t.settingsProjectTypeConfirmTitle,
      message: t.settingsProjectTypeConfirmMessage.replace("{type}", optionText(opt, language).label),
      confirmLabel: t.settingsProjectTypeConfirmButton,
      cancelLabel: t.cancel,
      variant: "warning",
    })
    if (ok) void change.mutate(opt.value)
  }

  return (
    <SettingsCard title={t.projectType}>
      <div role="group" aria-label={t.projectType} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {projectTypeOptions.map((opt) => {
          const { label, desc } = optionText(opt, language)
          const isSelected = projectType === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={isSelected}
              onClick={() => void select(opt)}
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
