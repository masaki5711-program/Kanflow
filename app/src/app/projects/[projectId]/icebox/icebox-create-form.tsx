"use client"

import { useState, type FormEvent } from "react"
import { GlossaryHint } from "@/components/i18n-text"
import { Button, Field, Input, Textarea, useUiLabels, useConfirm } from "@/components/ui"
import { apiFetch, useApiMutation, useUnsavedChangesGuard } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { Plus } from "lucide-react"

interface Props {
  projectId: string
  onCreated: () => void
  onClose: () => void
}

interface CreateVars {
  author: string
  request: string
  background: string
}

/** Inline "new request" card at the top of the IceBox page. */
export function IceboxCreateForm({ projectId, onCreated, onClose }: Props) {
  const { t, pt } = useLanguage()
  const ui = useUiLabels()
  const confirm = useConfirm()
  const [author, setAuthor] = useState("")
  const [request, setRequest] = useState("")
  const [background, setBackground] = useState("")
  const isDirty = author !== "" || request !== "" || background !== ""
  useUnsavedChangesGuard(isDirty)

  const create = useApiMutation(
    // Raw text is saved as typed; the other language is prepared by the
    // background translation worker.
    (v: CreateVars) =>
      apiFetch(`/api/projects/${projectId}/icebox`, {
        method: "POST",
        json: { request: v.request, background: v.background || undefined, author: v.author || undefined },
      }),
    {
      onSuccess: () => {
        onCreated()
        onClose()
      },
      toastOnError: (e) => `${t.iceboxSaveFailed}: ${e.message}`,
      toastOnSuccess: t.iceboxCreated,
    },
  )

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (create.isPending) return
    void create.mutate({ author, request, background })
  }

  async function handleCancel() {
    if (isDirty) {
      const ok = await confirm({ title: ui.unsavedTitle, message: ui.unsavedMessage, confirmLabel: ui.discard, cancelLabel: t.cancel, variant: "warning" })
      if (!ok) return
    }
    onClose()
  }

  return (
    <section aria-labelledby="icebox-new-request" className="mb-6 overflow-hidden rounded-ui-lg border border-border bg-surface shadow-ui-sm">
      <div className="h-1 bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-500" aria-hidden="true" />
      <div className="p-6">
        <h2 id="icebox-new-request" className="mb-4 flex items-center gap-2 text-title font-semibold text-fg">
          <Plus className="h-5 w-5 text-primary" />
          {t.iceboxNewRequest}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label={t.sprintAssignee} hint={t.iceboxAuthorHint}>
            <Input value={author} onChange={(e) => setAuthor(e.target.value)} maxLength={200} />
          </Field>
          <Field label={pt.iceboxRequest} required>
            <Textarea value={request} onChange={(e) => setRequest(e.target.value)} required rows={3} />
          </Field>
          <GlossaryHint className="-mt-2" />
          <Field label={pt.iceboxBackground}>
            <Textarea value={background} onChange={(e) => setBackground(e.target.value)} rows={3} />
          </Field>
          <div className="flex gap-2 pt-1">
            <Button type="submit" loading={create.isPending} leftIcon={<Plus className="h-4 w-4" />}>
              {t.add}
            </Button>
            <Button variant="secondary" onClick={handleCancel}>
              {t.cancel}
            </Button>
          </div>
        </form>
      </div>
    </section>
  )
}
