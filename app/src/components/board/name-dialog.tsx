"use client"

import { useId, useState, type FormEvent } from "react"
import { Button, Field, Input, Modal, useModalClose } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"

interface NameDialogProps {
  title: string
  /** Label of the single text field. */
  label: string
  initial: string
  maxLength: number
  submitLabel: string
  /** Saves the name; a rejection keeps the dialog open and shows its message under the field. */
  onSubmit: (name: string) => Promise<void>
  onClose: () => void
}

/** One-field dialog used to name a new board / sheet and to rename one. */
export function NameDialog({ title, label, initial, maxLength, submitLabel, onSubmit, onClose }: NameDialogProps) {
  const { t } = useLanguage()
  const formId = useId()
  const [name, setName] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    const value = name.trim()
    if (!value) return setError(t.wbNameRequired)
    if (value.length > maxLength) return setError(t.wbNameTooLong.replace("{max}", String(maxLength)))
    setBusy(true)
    setError(null)
    try {
      await onSubmit(value)
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t.errorRetry)
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={title} size="sm" footer={<Footer formId={formId} busy={busy} submitLabel={submitLabel} />}>
      <form id={formId} onSubmit={submit} noValidate>
        <Field label={label} error={error ?? undefined} required>
          <Input
            data-autofocus
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (error) setError(null)
            }}
            autoComplete="off"
          />
        </Field>
      </form>
    </Modal>
  )
}

function Footer({ formId, busy, submitLabel }: { formId: string; busy: boolean; submitLabel: string }) {
  const { t } = useLanguage()
  const close = useModalClose()
  return (
    <>
      <Button variant="secondary" onClick={close} disabled={busy}>
        {t.cancel}
      </Button>
      <Button type="submit" form={formId} loading={busy}>
        {submitLabel}
      </Button>
    </>
  )
}
