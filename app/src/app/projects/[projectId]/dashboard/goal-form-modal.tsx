"use client"

import { useState } from "react"
import { Button, Field, Modal, Textarea, useModalClose, useToast } from "@/components/ui"
import { apiFetch } from "@/hooks"
import { GlossaryHint } from "@/components/i18n-text"
import { useLanguage } from "@/lib/language-context"
import type { ProductGoal } from "./types"

interface GoalFormModalProps {
  projectId: string
  /** Goal being edited; null = create a new goal. */
  goal: ProductGoal | null
  onClose: () => void
  onSaved: (goal: ProductGoal, isNew: boolean) => void
}

const FORM_ID = "product-goal-form"

function Footer({ saving, isNew }: { saving: boolean; isNew: boolean }) {
  const { t } = useLanguage()
  const close = useModalClose()
  return (
    <>
      <Button variant="secondary" onClick={close}>{t.cancel}</Button>
      <Button type="submit" form={FORM_ID} loading={saving}>{isNew ? t.add : t.update}</Button>
    </>
  )
}

/** Create / edit a product goal. Mount it only while open so the form starts fresh. */
export function GoalFormModal({ projectId, goal, onClose, onSaved }: GoalFormModalProps) {
  const { t } = useLanguage()
  const toast = useToast()
  const initial = { title: goal?.title ?? "", description: goal?.description ?? "" }
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const isNew = goal === null
  const isDirty = form.title !== initial.title || form.description !== initial.description

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    try {
      const url = isNew ? `/api/projects/${projectId}/goals` : `/api/projects/${projectId}/goals/${goal.id}`
      const saved = await apiFetch<ProductGoal>(url, { method: isNew ? "POST" : "PATCH", json: form })
      onSaved(saved, isNew)
      onClose()
    } catch (err) {
      const title = isNew ? t.errorCreationFailed : t.errorUpdateFailed
      toast.error(err instanceof Error ? err.message : title, { title })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? t.dashboardAddGoal : t.dashboardEditGoal}
      size="lg"
      isDirty={isDirty}
      footer={<Footer saving={saving} isNew={isNew} />}
    >
      <form id={FORM_ID} onSubmit={submit} className="space-y-3">
        <Field label={t.dashboardProductGoals} required>
          <Textarea
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
            rows={3}
            className="leading-relaxed resize-y min-h-[80px]"
          />
        </Field>
        <Field label={t.dashboardDescription}>
          <Textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={6}
            className="leading-relaxed resize-y min-h-[160px]"
          />
        </Field>
        <GlossaryHint />
      </form>
    </Modal>
  )
}
