"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useLanguage } from "@/lib/language-context"
import { GlossaryHint } from "@/components/i18n-text"
import { Button, Field, Input, Modal, Textarea, useToast } from "@/components/ui"
import { apiFetch, useVersionConflict, withVersion } from "@/hooks"
import type { SprintDto } from "@/types/api"
import { messageOf } from "../lib/errors"
import ModalCancelButton from "./modal-cancel-button"

type SprintLite = Pick<SprintDto, "id" | "sprintName" | "startDate" | "endDate" | "sprintGoal" | "capacity" | "version">

interface Props {
  projectId: string
  sprint: SprintLite
  onClose: () => void
  onSaved?: () => void
}

const FORM_ID_PREFIX = "sprint-edit-form-"

function toDateInput(iso: string): string {
  return iso ? iso.slice(0, 10) : ""
}

export default function SprintEditDialog({ projectId, sprint, onClose, onSaved }: Props) {
  const { t } = useLanguage()
  const toast = useToast()
  const router = useRouter()
  const onVersionConflict = useVersionConflict()
  // Always edit the original (source-language) text, never the translation.
  const [initial] = useState(() => ({
    sprintName: sprint.sprintName,
    startDate: toDateInput(sprint.startDate),
    endDate: toDateInput(sprint.endDate),
    sprintGoal: sprint.sprintGoal ?? "",
    capacity: sprint.capacity,
  }))
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const formId = `${FORM_ID_PREFIX}${sprint.id}`
  const isDirty = (Object.keys(initial) as (keyof typeof initial)[]).some((k) => form[k] !== initial[k])
  const isValid = !!form.sprintName.trim() && !!form.startDate && !!form.endDate

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving || !isValid) return
    setSaving(true)
    try {
      await apiFetch(`/api/projects/${projectId}/sprints/${sprint.id}`, {
        method: "PATCH",
        json: withVersion({
          sprintName: form.sprintName.trim(),
          startDate: form.startDate,
          endDate: form.endDate,
          sprintGoal: form.sprintGoal.trim() || null,
          capacity: Number(form.capacity) || 0,
        }, sprint.version),
      })
      toast.success(t.sprintSaved)
      onSaved?.()
      router.refresh()
      onClose()
    } catch (err) {
      // Stale edit: reload the sprints and close; the user re-opens on the latest values.
      if (onVersionConflict(err, () => { onSaved?.(); onClose() })) return
      toast.error(messageOf(err, t.error), { title: t.sprintUpdateFailed })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={t.sprintEditTitle} isDirty={isDirty && !saving}
      footer={
        <>
          <ModalCancelButton disabled={saving} />
          <Button type="submit" form={formId} loading={saving} disabled={!isValid}>{t.save}</Button>
        </>
      }>
      <form id={formId} onSubmit={handleSubmit} className="space-y-4">
        <Field label={t.sprintName} required>
          <Input value={form.sprintName} maxLength={200} required
            onChange={(e) => setForm({ ...form, sprintName: e.target.value })} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={t.sprintStartDate} required>
            <Input type="date" value={form.startDate} required onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </Field>
          <Field label={t.sprintEndDate} required>
            <Input type="date" value={form.endDate} min={form.startDate || undefined} required
              onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </Field>
        </div>
        <Field label={t.sprintGoal}>
          <Textarea value={form.sprintGoal} rows={3} maxLength={5000}
            onChange={(e) => setForm({ ...form, sprintGoal: e.target.value })} />
        </Field>
        <GlossaryHint />
        <Field label={t.sprintCapacity}>
          <div className="w-32">
            <Input type="number" min={0} value={form.capacity}
              onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) || 0 })} />
          </div>
        </Field>
      </form>
    </Modal>
  )
}
