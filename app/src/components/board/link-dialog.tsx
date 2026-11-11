"use client"

import { useId, useState, type FormEvent } from "react"
import { Button, Field, Input, Modal, useModalClose } from "@/components/ui"
import { BOARD_LIMITS } from "@/lib/board/limits"
import { isHttpUrl } from "@/lib/board/model"
import { useLanguage } from "@/lib/language-context"

interface LinkDialogProps {
  initial: string
  /** Sets the link (an http(s) address) or removes it (null). */
  onSubmit: (link: string | null) => void
  onClose: () => void
}

/** Sets or removes the link of the selected elements. Only http:// and https:// addresses are accepted. */
export function LinkDialog({ initial, onSubmit, onClose }: LinkDialogProps) {
  const { t } = useLanguage()
  const formId = useId()
  const [value, setValue] = useState(initial)
  const [error, setError] = useState<string | null>(null)

  function submit(e: FormEvent) {
    e.preventDefault()
    const url = value.trim()
    if (url === "") {
      onSubmit(null)
      return
    }
    if (!isHttpUrl(url) || url.length > BOARD_LIMITS.linkLength) {
      setError(t.wbLinkInvalid)
      return
    }
    onSubmit(url)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t.wbLinkTitle}
      size="sm"
      footer={<Footer formId={formId} canRemove={initial !== ""} onRemove={() => onSubmit(null)} />}
    >
      <form id={formId} onSubmit={submit} noValidate>
        <Field label={t.wbLinkUrl} error={error ?? undefined}>
          <Input
            data-autofocus
            type="url"
            inputMode="url"
            value={value}
            maxLength={BOARD_LIMITS.linkLength}
            placeholder="https://"
            onChange={(e) => {
              setValue(e.target.value)
              if (error) setError(null)
            }}
            autoComplete="off"
          />
        </Field>
      </form>
    </Modal>
  )
}

function Footer({ formId, canRemove, onRemove }: { formId: string; canRemove: boolean; onRemove: () => void }) {
  const { t } = useLanguage()
  const close = useModalClose()
  return (
    <>
      {canRemove && (
        <Button variant="secondary" onClick={onRemove} className="mr-auto">
          {t.wbLinkRemove}
        </Button>
      )}
      <Button variant="secondary" onClick={close}>
        {t.cancel}
      </Button>
      <Button type="submit" form={formId}>
        {t.wbLinkSave}
      </Button>
    </>
  )
}
