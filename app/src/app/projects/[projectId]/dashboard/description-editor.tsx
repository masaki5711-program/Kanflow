"use client"

import { useId, useState } from "react"
import { Button, Textarea, useToast } from "@/components/ui"
import { apiFetch, useUnsavedChangesGuard } from "@/hooks"
import { GlossaryHint, I18nText } from "@/components/i18n-text"
import { useLanguage } from "@/lib/language-context"
import type { EntityI18n } from "@/lib/translation/types"
import { Pencil } from "lucide-react"
interface DescriptionEditorProps {
  projectId: string
  initialDescription: string | null
  i18n: EntityI18n | undefined
  onI18nChange: (next: EntityI18n | undefined) => void
}

/**
 * Project purpose/overview. The editor binds the ORIGINAL text; after a save
 * the stored text becomes the new source and its translation is refreshed by
 * the background worker (the badge shows "pending" until then).
 */
export function DescriptionEditor({ projectId, initialDescription, i18n, onI18nChange }: DescriptionEditorProps) {
  const { t } = useLanguage()
  const toast = useToast()
  const labelId = useId()
  const [saved, setSaved] = useState<string | null>(initialDescription)
  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const editing = draft !== null
  useUnsavedChangesGuard(editing && draft !== (saved ?? ""))

  async function save() {
    if (draft === null) return
    setSaving(true)
    try {
      const res = await apiFetch<{ description?: string | null }>(`/api/projects/${projectId}`, {
        method: "PATCH",
        json: { description: draft },
      })
      const stored = res?.description ?? draft
      if (stored !== saved) onI18nChange({ ...i18n, description: undefined })
      setSaved(stored)
      // Inline edit: the new value replaces the editor in place, so no success toast.
      setDraft(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.errorUpdateFailed, { title: t.errorUpdateFailed })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-1.5">
        <h3 id={labelId} className="text-body font-medium text-fg-muted">{t.dashboardDescription}</h3>
        {!editing && (
          <Button variant="ghost" size="sm" leftIcon={<Pencil className="w-3.5 h-3.5" />} onClick={() => setDraft(saved ?? "")}>
            {t.edit}
          </Button>
        )}
      </div>
      {editing ? (
        <div>
          <Textarea
            aria-labelledby={labelId}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={10}
            placeholder={t.dashboardDescriptionPlaceholder}
            className="leading-relaxed resize-y min-h-[200px]"
            autoFocus
          />
          <GlossaryHint className="mt-1" />
          <div className="flex gap-2 mt-2">
            <Button size="sm" loading={saving} onClick={save}>{t.save}</Button>
            <Button size="sm" variant="secondary" onClick={() => setDraft(null)}>{t.cancel}</Button>
          </div>
        </div>
      ) : (
        <div className="min-h-[160px] max-h-[480px] overflow-y-auto px-4 py-3 bg-surface-muted rounded-ui-sm text-body text-fg whitespace-pre-wrap leading-relaxed">
          <I18nText
            i18n={i18n}
            field="description"
            original={saved}
            entity={{ type: "project", id: projectId }}
            fallback={<span className="text-fg-subtle">{t.dashboardDescriptionPlaceholder}</span>}
          />
        </div>
      )}
    </div>
  )
}
