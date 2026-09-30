"use client"

import { useState } from "react"
import { Button, Field, Input, Modal, Select, Textarea, useModalClose, useConfirm } from "@/components/ui"
import { GlossaryHint } from "@/components/i18n-text"
import { useLanguage } from "@/lib/language-context"
import { formatYmd, type PlanItem } from "./lib/plan-utils"

interface Props {
  /** Item being edited. Mount with `key={item.id}` so the form re-initialises per item. */
  item: PlanItem
  parentOptions: { id: string; name: string; depth: number }[]
  readOnly: boolean
  onClose: () => void
  onSave: (patch: Partial<PlanItem>) => Promise<boolean>
  onDelete?: () => Promise<boolean>
}

const FORM_ID = "plan-item-form"
const STATUSES = ["not_started", "in_progress", "done", "on_hold", "delayed"] as const

function formFromItem(item: PlanItem) {
  return {
    name: item.name,
    description: item.description ?? "",
    plannedStart: formatYmd(item.plannedStart),
    plannedEnd: formatYmd(item.plannedEnd),
    actualStart: item.actualStart ? formatYmd(item.actualStart) : "",
    actualEnd: item.actualEnd ? formatYmd(item.actualEnd) : "",
    status: item.status,
    parentId: item.parentId ?? "",
    isMilestone: item.isMilestone,
    notes: item.notes ?? "",
  }
}

type PlanForm = ReturnType<typeof formFromItem>

function Footer({ saving, readOnly, onDelete }: { saving: boolean; readOnly: boolean; onDelete?: () => void }) {
  const { t } = useLanguage()
  const close = useModalClose()
  return (
    <>
      {onDelete && (
        <Button variant="ghost" className="mr-auto text-danger hover:text-danger" onClick={onDelete}>{t.delete}</Button>
      )}
      <Button variant="secondary" onClick={close}>{readOnly ? t.close : t.cancel}</Button>
      {!readOnly && <Button type="submit" form={FORM_ID} loading={saving}>{t.update}</Button>}
    </>
  )
}

export default function PlanEditModal({ item, parentOptions, readOnly, onClose, onSave, onDelete }: Props) {
  const { t } = useLanguage()
  const confirm = useConfirm()
  const [initial] = useState(() => formFromItem(item))
  const [form, setForm] = useState<PlanForm>(initial)
  const [saving, setSaving] = useState(false)
  const isDirty = !readOnly && (Object.keys(initial) as (keyof PlanForm)[]).some((k) => form[k] !== initial[k])
  const set = <K extends keyof PlanForm>(key: K, value: PlanForm[K]) => setForm((f) => ({ ...f, [key]: value }))
  const statusLabel: Record<(typeof STATUSES)[number], string> = {
    not_started: t.planStatusNotStarted,
    in_progress: t.planStatusInProgress,
    done: t.planStatusDone,
    on_hold: t.planStatusOnHold,
    delayed: t.planStatusDelayed,
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (readOnly) return
    setSaving(true)
    const ok = await onSave({
      name: form.name,
      description: form.description || null,
      plannedStart: form.plannedStart,
      plannedEnd: form.plannedEnd,
      actualStart: form.actualStart || null,
      actualEnd: form.actualEnd || null,
      status: form.status,
      parentId: form.parentId || null,
      isMilestone: form.isMilestone,
      notes: form.notes || null,
    })
    setSaving(false)
    if (ok) onClose()
  }

  async function handleDelete() {
    if (!onDelete) return
    const ok = await confirm({ message: t.planConfirmDelete, confirmLabel: t.delete, cancelLabel: t.cancel, variant: "danger" })
    if (ok && (await onDelete())) onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t.planEditTitle}
      size="lg"
      isDirty={isDirty}
      footer={<Footer saving={saving} readOnly={readOnly} onDelete={onDelete && !readOnly ? handleDelete : undefined} />}
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4">
        <fieldset disabled={readOnly} className="space-y-4">
          <Field label={t.planNamePlaceholder} required>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} required maxLength={255} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t.planPlannedStart} required>
              <Input type="date" value={form.plannedStart} onChange={(e) => set("plannedStart", e.target.value)} required />
            </Field>
            <Field label={t.planPlannedEnd} required>
              <Input type="date" value={form.plannedEnd} onChange={(e) => set("plannedEnd", e.target.value)} required />
            </Field>
            <Field label={t.planActualStart}>
              <Input type="date" value={form.actualStart} onChange={(e) => set("actualStart", e.target.value)} />
            </Field>
            <Field label={t.planActualEnd}>
              <Input type="date" value={form.actualEnd} onChange={(e) => set("actualEnd", e.target.value)} />
            </Field>
            <Field label={t.planStatus}>
              <Select value={form.status} onChange={(e) => set("status", e.target.value)}>
                {STATUSES.map((s) => <option key={s} value={s}>{statusLabel[s]}</option>)}
              </Select>
            </Field>
            <Field label={t.planParent}>
              <Select value={form.parentId} onChange={(e) => set("parentId", e.target.value)}>
                <option value="">{t.planRootOption}</option>
                {parentOptions
                  .filter((p) => p.id !== item.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>{"  ".repeat(p.depth)}{p.name}</option>
                  ))}
              </Select>
            </Field>
          </div>
          <label className="inline-flex items-center gap-2 min-h-6 text-body text-fg">
            <input type="checkbox" checked={form.isMilestone} onChange={(e) => set("isMilestone", e.target.checked)} className="h-4 w-4" />
            {t.planIsMilestone}
          </label>
          <Field label={t.planNotes}>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} />
          </Field>
          <GlossaryHint />
        </fieldset>
      </form>
    </Modal>
  )
}
