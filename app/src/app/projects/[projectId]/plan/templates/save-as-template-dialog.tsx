"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button, Field, Input, Modal, Textarea, useToast } from "@/components/ui"
import { apiFetch } from "@/hooks"
import { fillTemplate } from "@/lib/fill-template"
import { useLanguage } from "@/lib/language-context"
import { VisibilityField } from "@/components/plan-templates/visibility-field"
import type { PlanTemplateDto } from "@/components/plan-templates/template-groups"

interface Props {
  projectId: string
  defaultName: string
  onClose: () => void
}

/** 「この計画をテンプレートとして保存」: name / description / visibility → POST /plan/templates/save. */
export function SaveAsTemplateDialog({ projectId, defaultName, onClose }: Props) {
  const { t } = useLanguage()
  const toast = useToast()
  const router = useRouter()
  const [name, setName] = useState(defaultName)
  const [description, setDescription] = useState("")
  const [visibility, setVisibility] = useState<"public" | "private">("public")
  const [busy, setBusy] = useState(false)
  const [touched, setTouched] = useState(false)
  const nameError = touched && !name.trim() ? t.tplNameRequired : undefined

  async function submit() {
    setTouched(true)
    if (!name.trim()) return
    setBusy(true)
    try {
      const created = await apiFetch<PlanTemplateDto>(`/api/projects/${projectId}/plan/templates/save`, {
        method: "POST",
        json: { name: name.trim(), description: description.trim() || null, visibility },
      })
      toast.success(fillTemplate(t.tplSaved, { name: created.name }), {
        action: { label: t.tplOpenTemplate, onClick: () => router.push(`/templates/${created.id}`) },
      })
      onClose()
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : t.tplSaveFailed, { title: t.tplSaveFailed })
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={t.tplSaveTitle}
      description={t.tplSaveDesc}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t.cancel}</Button>
          <Button onClick={() => void submit()} loading={busy} data-testid="tpl-save-submit">{t.tplSaveSubmit}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t.tplName} required error={nameError}>
          <Input value={name} maxLength={255} onChange={(e) => setName(e.target.value)} data-autofocus />
        </Field>
        <Field label={t.tplDescription}>
          <Textarea value={description} maxLength={2000} rows={2} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <VisibilityField value={visibility} onChange={setVisibility} name="tpl-save-visibility" />
      </div>
    </Modal>
  )
}
