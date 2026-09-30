"use client"

import { useState } from "react"
import { useLanguage } from "@/lib/language-context"
import { I18nText } from "@/components/i18n-text"
import { pickText } from "@/lib/translation/pick-text"
import { Button, Field, Select } from "@/components/ui"
import { useApiQuery } from "@/hooks"
import type { FixedTaskGroupDto } from "@/types/api"

type FixedTaskGroup = FixedTaskGroupDto

interface Props {
  /** Selected PBI; bulk add is disabled until one is chosen. */
  pbItemId: string
  onBulkAdd: (taskNames: string[]) => Promise<void>
}

/** "Apply from my fixed-task template": adds every task of a group at once. */
export default function FixedTaskBulkAdd({ pbItemId, onBulkAdd }: Props) {
  const { t, language } = useLanguage()
  const { data: groups = [] } = useApiQuery<FixedTaskGroup[]>("/api/user/fixed-tasks", { toastOnError: true })
  const [selectedGroupId, setSelectedGroupId] = useState("")
  const [busy, setBusy] = useState(false)
  const selectedGroup = groups.find((g) => g.id === selectedGroupId)
  if (groups.length === 0) return null

  const count = selectedGroup?.items.length ?? 0
  const canAdd = !!selectedGroup && count > 0 && !!pbItemId && !busy

  async function handleAdd() {
    if (!selectedGroup || !canAdd) return
    setBusy(true)
    try {
      await onBulkAdd(selectedGroup.items.map((it) => it.taskName))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-ui-sm border border-primary/30 bg-primary-soft/30 p-3 space-y-2">
      <Field label={t.fixedTasksApplyFromTemplate}>
        <Select value={selectedGroupId} onChange={(e) => setSelectedGroupId(e.target.value)}>
          <option value="">{t.fixedTasksSelectPlaceholder}</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {pickText(g.i18n, "taskName", g.taskName, language).text} ({g.items.length})
            </option>
          ))}
        </Select>
      </Field>
      {selectedGroup && (
        <>
          <p className="text-caption text-primary-active font-medium">{t.fixedTasksBulkAddPreview}:</p>
          {count === 0 ? (
            <p className="text-caption text-fg-muted">{t.fixedTasksItemEmpty}</p>
          ) : (
            <ul className="text-caption text-fg space-y-0.5 pl-4 list-disc marker:text-primary/50">
              {selectedGroup.items.map((it) => (
                <li key={it.id}>
                  <I18nText i18n={it.i18n} field="taskName" original={it.taskName} noBadge className="break-words" />
                </li>
              ))}
            </ul>
          )}
          <Button fullWidth size="sm" onClick={handleAdd} disabled={!canAdd} loading={busy}>
            {t.fixedTasksBulkAdd}{count > 0 ? ` (${count})` : ""}
          </Button>
        </>
      )}
    </div>
  )
}
