"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button, cn, Field, Input, Modal, Textarea, useModalClose } from "@/components/ui"
import { apiFetch, useApiMutation } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { projectTypeOptions, type ProjectType } from "@/lib/project-type-labels"
import { projectTypeEmoji } from "./types"

const FORM_ID = "project-create-form"

interface CreateBody {
  name: string
  description: string
  projectType: ProjectType
}

const EMPTY: CreateBody = { name: "", description: "", projectType: "software" }

function CreateFooter({ saving, canSubmit }: { saving: boolean; canSubmit: boolean }) {
  const { t } = useLanguage()
  const close = useModalClose()
  return (
    <>
      <Button variant="secondary" onClick={close}>
        {t.cancel}
      </Button>
      <Button type="submit" form={FORM_ID} loading={saving} disabled={!canSubmit}>
        {t.create}
      </Button>
    </>
  )
}

export function ProjectCreateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const { t, language } = useLanguage()
  const [form, setForm] = useState<CreateBody>(EMPTY)

  const isDirty = form.name !== "" || form.description !== "" || form.projectType !== EMPTY.projectType

  function close() {
    setForm(EMPTY)
    onClose()
  }

  const create = useApiMutation((body: CreateBody) => apiFetch("/api/projects", { method: "POST", json: body }), {
    onSuccess: () => {
      close()
      router.refresh()
    },
    toastOnSuccess: t.projectCreated,
    toastOnError: (e) => `${t.projectCreateFailed}: ${e.message}`,
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    void create.mutate({ ...form, name: form.name.trim() })
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={t.projectCreateTitle}
      size="lg"
      isDirty={isDirty}
      footer={<CreateFooter saving={create.isPending} canSubmit={form.name.trim() !== ""} />}
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4">
        <fieldset>
          <legend className="mb-2 text-body font-medium text-fg">{t.projectType}</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {projectTypeOptions.map((opt) => {
              const checked = form.projectType === opt.value
              const label = language === "ja" ? opt.labelJa : language === "id" ? opt.labelId : opt.labelEn
              const desc = language === "ja" ? opt.descJa : language === "id" ? opt.descId : opt.descEn
              return (
                <label
                  key={opt.value}
                  className={cn(
                    "cursor-pointer rounded-xl border-2 p-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
                    checked ? "border-primary bg-primary-soft/50" : "border-border hover:border-border-strong hover:bg-surface-muted",
                  )}
                >
                  <input
                    type="radio"
                    name="projectType"
                    value={opt.value}
                    checked={checked}
                    onChange={() => setForm((f) => ({ ...f, projectType: opt.value }))}
                    className="sr-only"
                  />
                  <span aria-hidden="true" className="mb-1 block text-title">
                    {projectTypeEmoji(opt.value)}
                  </span>
                  <span className="block text-body font-semibold text-fg">{label}</span>
                  <span className="mt-0.5 block text-caption text-fg-muted">{desc}</span>
                </label>
              )
            })}
          </div>
        </fieldset>
        <Field label={t.projectName} required>
          <Input
            data-autofocus
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
            placeholder={t.projectNamePlaceholder}
          />
        </Field>
        <Field label={t.projectDescription}>
          <Textarea
            rows={3}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder={t.projectDescriptionPlaceholder}
            className="resize-none"
          />
        </Field>
      </form>
    </Modal>
  )
}
