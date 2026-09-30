"use client"

import { useState } from "react"
import { useLanguage } from "@/lib/language-context"
import { Button, Modal, useModalClose } from "@/components/ui"
import { apiFetch, useApiMutation, useUnsavedChangesGuard } from "@/hooks"
import { PbiEditFields } from "@/components/pbi-form/pbi-edit-fields"
import { EMPTY_PBI_FORM, buildPbiCreateBody, isSamePbiForm, type PbiForm } from "@/components/pbi-form/pbi-form-state"
import { useAiFieldGenerator } from "@/components/pbi-form/use-ai-field-generator"
import { usePbiFormOptions, type PbiFormOptions } from "@/components/pbi-form/use-pbi-form-options"

export interface CreatedPbi {
  id: string
  displayId?: number
}

interface Props {
  projectId: string
  onClose: () => void
  /** Called with the new PBI after it was saved (the modal closes itself). */
  onCreated?: (created: CreatedPbi) => void
  /** Pre-filled values (e.g. an IceBox AI draft). They count as unsaved until created. */
  initialForm?: Partial<PbiForm>
  formOptions?: PbiFormOptions
}

/** New PBI: the same fields as the detail modal's edit mode, saved with POST. */
export function PbiCreateModal({ projectId, onClose, onCreated, initialForm, formOptions }: Props) {
  const { t } = useLanguage()
  const [form, setForm] = useState<PbiForm>(() => ({ ...EMPTY_PBI_FORM, ...initialForm }))
  const options = usePbiFormOptions(projectId, true, formOptions)
  const ai = useAiFieldGenerator(projectId, form, setForm)
  // Compared with the empty form, so an unsaved pre-filled draft still asks before closing.
  const isDirty = !isSamePbiForm(form, EMPTY_PBI_FORM)
  useUnsavedChangesGuard(isDirty)

  const create = useApiMutation(
    (body: Record<string, unknown>) => apiFetch<CreatedPbi>(`/api/projects/${projectId}/backlog`, { method: "POST", json: body }),
    {
      onSuccess: (created) => {
        onCreated?.(created)
        onClose()
      },
      toastOnError: (e) => `${t.backlogSaveFailed}: ${e.message}`,
      toastOnSuccess: t.backlogSaved,
    },
  )

  function submit() {
    // Never save while an AI stream is still writing into the form.
    if (ai.generating || create.isPending) return
    void create.mutate(buildPbiCreateBody(form))
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t.backlogAddItem}
      isDirty={isDirty && !create.isPending}
      footer={<CreateFooter saving={create.isPending} generating={ai.generating !== null} onSubmit={submit} />}
    >
      <PbiEditFields
        form={form}
        setForm={setForm}
        options={options}
        disabled={create.isPending}
        generating={ai.generating}
        onGenerate={ai.generate}
      />
    </Modal>
  )
}

function CreateFooter({ saving, generating, onSubmit }: { saving: boolean; generating: boolean; onSubmit: () => void }) {
  const { t } = useLanguage()
  const close = useModalClose()
  return (
    <>
      <Button variant="secondary" onClick={close}>
        {t.cancel}
      </Button>
      <Button onClick={onSubmit} loading={saving} disabled={generating}>
        {t.add}
      </Button>
    </>
  )
}
