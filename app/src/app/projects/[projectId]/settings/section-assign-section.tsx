"use client"

import { useState } from "react"
import { Button, EmptyState, SkeletonLines, cn } from "@/components/ui"
import { apiFetch, useApiMutation, useApiQuery } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { SettingsCard } from "./settings-card"
import type { SectionOption } from "./settings-types"

interface SectionAssignProps {
  projectId: string
  /** Section ids currently assigned to the project (initial selection). */
  initialSectionIds: string[]
}

/** Section assignment (admin or PO only — the caller decides visibility). */
export function SectionAssignSection({ projectId, initialSectionIds }: SectionAssignProps) {
  const { t } = useLanguage()
  const [selectedIds, setSelectedIds] = useState<readonly string[]>(initialSectionIds)

  const { data: allSections = [], isLoading } = useApiQuery<SectionOption[]>("/api/sections", {
    parse: (raw) =>
      Array.isArray(raw) ? (raw as SectionOption[]).map((s) => ({ id: s.id, name: s.name })) : [],
    toastOnError: true,
  })

  const save = useApiMutation(
    (sectionIds: readonly string[]) =>
      apiFetch(`/api/projects/${projectId}`, { method: "PATCH", json: { sectionIds } }),
    { toastOnSuccess: t.saved, toastOnError: () => t.settingsSaveFailed },
  )

  function toggle(id: string, checked: boolean) {
    setSelectedIds((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)))
  }

  return (
    <SettingsCard title={t.sectionTitle}>
      <p className="mb-3 text-body text-fg-muted">{t.sectionAssignHint}</p>
      {isLoading ? (
        <SkeletonLines lines={2} label={t.loading} className="mb-3" />
      ) : allSections.length === 0 ? (
        <EmptyState compact title={t.sectionEmpty} />
      ) : (
        <fieldset className="mb-3 flex flex-wrap gap-2">
          <legend className="sr-only">{t.sectionTitle}</legend>
          {allSections.map((s) => {
            const checked = selectedIds.includes(s.id)
            return (
              <label
                key={s.id}
                className={cn(
                  "inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-caption font-medium transition-colors",
                  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
                  checked
                    ? "border-warning bg-warning-soft text-warning-strong"
                    : "border-border bg-surface text-fg-muted hover:border-border-strong",
                )}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  onChange={(e) => toggle(s.id, e.target.checked)}
                />
                {s.name}
              </label>
            )
          })}
        </fieldset>
      )}
      <Button
        onClick={() => save.mutate(selectedIds)}
        loading={save.isPending}
        disabled={allSections.length === 0}
      >
        {t.save}
      </Button>
    </SettingsCard>
  )
}
