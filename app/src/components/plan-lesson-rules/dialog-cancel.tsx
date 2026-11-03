"use client"

import { Button, useModalClose } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"

/**
 * Footer Cancel of the lesson-rule dialogs: the Modal's guarded close (asks before discarding typed text, like Esc
 * and ✕). Stays enabled during a save — closing then only hides the dialog; the save still completes.
 */
export function DialogCancel() {
  const { t } = useLanguage()
  const close = useModalClose()
  return (
    <Button variant="secondary" onClick={close}>
      {t.cancel}
    </Button>
  )
}
