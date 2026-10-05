"use client"

import { useState } from "react"
import { Button, Field, Input, Modal, useModalClose, useToast } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { MS_CHECK_LABEL_MAX } from "@/lib/milestones/constants"
import type { MilestoneBoard } from "./milestone-types"
import type { BoardWriter } from "./use-milestone-board"

interface Props {
  settings: MilestoneBoard["settings"]
  write: BoardWriter
  onClose: () => void
}

/** ボードの設定 (PO / SM): the check 呼び名 and the 予算 / 推移 switches. */
export function SettingsDialog({ settings, write, onClose }: Props) {
  const { t } = useLanguage()
  const toast = useToast()
  const [checkLabel, setCheckLabel] = useState(settings.checkLabel ?? "")
  const [budgetEnabled, setBudgetEnabled] = useState(settings.budgetEnabled)
  const [trendEnabled, setTrendEnabled] = useState(settings.trendEnabled)
  const [saving, setSaving] = useState(false)
  const dirty = checkLabel !== (settings.checkLabel ?? "") || budgetEnabled !== settings.budgetEnabled || trendEnabled !== settings.trendEnabled

  async function save() {
    setSaving(true)
    const result = await write("/settings", { method: "PATCH", json: { checkLabel: checkLabel.trim() || null, budgetEnabled, trendEnabled } })
    setSaving(false)
    if (!result.ok) return toast.error(result.message)
    toast.success(t.msSaved)
    onClose()
  }

  return (
    <Modal open size="sm" onClose={onClose} title={t.msSettings} isDirty={dirty} footer={<Footer saving={saving} canSave={dirty} onSave={() => void save()} />}>
      <div className="space-y-4">
        <Field label={t.msSettingsCheckLabel} hint={t.msSettingsCheckLabelHint}>
          <Input value={checkLabel} maxLength={MS_CHECK_LABEL_MAX} onChange={(e) => setCheckLabel(e.target.value)} data-autofocus />
        </Field>
        <Toggle label={t.msSettingsBudget} checked={budgetEnabled} onChange={setBudgetEnabled} />
        <Toggle label={t.msSettingsTrend} checked={trendEnabled} onChange={setTrendEnabled} />
      </div>
    </Modal>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-10 cursor-pointer items-center gap-3 text-body text-fg">
      <input type="checkbox" className="h-5 w-5 accent-primary" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

function Footer({ saving, canSave, onSave }: { saving: boolean; canSave: boolean; onSave: () => void }) {
  const { t } = useLanguage()
  const close = useModalClose()
  return (
    <div className="flex w-full justify-end gap-3">
      <Button variant="secondary" onClick={close}>
        {t.cancel}
      </Button>
      <Button onClick={onSave} loading={saving} disabled={!canSave}>
        {t.save}
      </Button>
    </div>
  )
}
