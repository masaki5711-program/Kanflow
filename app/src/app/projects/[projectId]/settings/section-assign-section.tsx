"use client"

import { useState } from "react"
import { EmptyState, SkeletonLines, cn } from "@/components/ui"
import { apiFetch, useApiMutation, useApiQuery, useUnsavedChangesGuard } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { SettingsCard, SettingsSaveRow } from "./settings-card"
import type { SectionOption } from "./settings-types"

interface SectionAssignProps {
  projectId: string
  /** Section ids currently assigned to the project (initial selection). */
  initialSectionIds: string[]
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((id) => set.has(id))
}

/** Section assignment (admin or PO only — the caller decides visibility). */
export function SectionAssignSection({ projectId, initialSectionIds }: SectionAssignProps) {
  const { t } = useLanguage()
  const [savedIds, setSavedIds] = useState<readonly string[]>(initialSectionIds)
  const [selectedIds, setSelectedIds] = useState<readonly string[]>(initialSectionIds)
  const isDirty = !sameIds(savedIds, selectedIds)
  useUnsavedChangesGuard(isDirty)

  const { data: allSections = [], isLoading } = useApiQuery<SectionOption[]>("/api/sections", {
    parse: (raw) =>
      Array.isArray(raw) ? (raw as SectionOption[]).map((s) => ({ id: s.id, name: s.name })) : [],
    toastOnError: true,
  })

  const save = useApiMutation(
    (sectionIds: readonly string[]) =>
      apiFetch(`/api/projects/${projectId}`, { method: "PATCH", json: { sectionIds } }),
    { onSuccess: (_r, ids) => setSavedIds(ids), toastOnSuccess: t.saved, toastOnError: () => t.settingsSaveFailed },
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
      <SettingsSaveRow
        isDirty={isDirty}
        saving={save.isPending}
        label={t.save}
        unsavedLabel={t.settingsUnsavedChanges}
        onSave={() => void save.mutate(selectedIds)}
        disabled={allSections.length === 0}
      />
    </SettingsCard>
  )
}
