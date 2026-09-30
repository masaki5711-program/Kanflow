"use client"

import { useId, useState } from "react"
import { useLanguage } from "@/lib/language-context"
import { Button, Modal, useConfirm, useModalClose, useUiLabels } from "@/components/ui"
import { apiFetch, useApiMutation, useUnsavedChangesGuard } from "@/hooks"
import { useBackNavigationGuard } from "@/hooks/use-back-navigation-guard"
import { PbiEditFields } from "@/components/pbi-form/pbi-edit-fields"
import { EMPTY_PBI_FORM, buildPbiCreateBody, hasPbiFormContent, isSamePbiForm, type PbiForm } from "@/components/pbi-form/pbi-form-state"
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

/**
 * New PBI: the same fields as the detail modal's edit mode, saved with POST.
 * "Add" stays disabled until the PBI has a title (a user story or an
 * initiative — the API refuses untitled PBIs with 400 PBI_CONTENT_REQUIRED).
 */
export function PbiCreateModal({ projectId, onClose, onCreated, initialForm, formOptions }: Props) {
  const { t, pt } = useLanguage()
  const ui = useUiLabels()
  const confirm = useConfirm()
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
      // "added", not "saved": this is a create (A3-15).
      toastOnSuccess: (created) =>
        created?.displayId != null ? t.backlogCreatedToast.replace("{id}", String(created.displayId)) : t.backlogSaved,
    },
  )
  useBackNavigationGuard(isDirty && !create.isPending, () =>
    confirm({ title: ui.unsavedTitle, message: ui.unsavedMessage, confirmLabel: ui.discard, cancelLabel: t.cancel, variant: "warning" }),
  )

  const hasContent = hasPbiFormContent(form)
  const contentMessage = t.backlogContentRequired.replace("{story}", pt.backlogUserStory).replace("{initiative}", pt.backlogInitiative)

  function submit() {
    // Never save while an AI stream is still writing into the form, nor an untitled PBI.
    if (ai.generating || create.isPending || !hasContent) return
    void create.mutate(buildPbiCreateBody(form))
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t.backlogAddItem}
      isDirty={isDirty && !create.isPending}
      footer={
        <CreateFooter
          saving={create.isPending}
          generating={ai.generating !== null}
          // Untouched form: a quiet hint by the button; once the user started, an inline error on the field.
          missingHint={!hasContent && !isDirty ? contentMessage : null}
          canSubmit={hasContent}
          onSubmit={submit}
        />
      }
    >
      <PbiEditFields
        form={form}
        setForm={setForm}
        options={options}
        disabled={create.isPending}
        generating={ai.generating}
        onGenerate={ai.generate}
        contentError={!hasContent && isDirty ? contentMessage : undefined}
      />
    </Modal>
  )
}

interface FooterProps {
  saving: boolean
  generating: boolean
  missingHint: string | null
  canSubmit: boolean
  onSubmit: () => void
}

function CreateFooter({ saving, generating, missingHint, canSubmit, onSubmit }: FooterProps) {
  const { t } = useLanguage()
  const close = useModalClose()
  const hintId = useId()
  return (
    <>
      {missingHint && (
        <p id={hintId} className="mr-auto text-caption text-fg-muted">
          {missingHint}
        </p>
      )}
      <Button variant="secondary" onClick={close}>
        {t.cancel}
      </Button>
      <Button onClick={onSubmit} loading={saving} disabled={generating || !canSubmit} aria-describedby={missingHint ? hintId : undefined}>
        {t.add}
      </Button>
    </>
  )
}
