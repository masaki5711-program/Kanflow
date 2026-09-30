"use client"

import { Button, useModalClose } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"

/** Footer "Cancel" that goes through the Modal's dirty-check (must render inside a Modal). */
export default function ModalCancelButton({ disabled }: { disabled?: boolean }) {
  const { t } = useLanguage()
  const close = useModalClose()
  return <Button variant="secondary" onClick={close} disabled={disabled}>{t.cancel}</Button>
}
