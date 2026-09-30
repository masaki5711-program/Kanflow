"use client"

import { Button, useConfirm, useModalClose, useUiLabels } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { Link2, Pencil } from "lucide-react"

export interface PbiDetailFooterProps {
  isEditing: boolean
  canEdit: boolean
  isDirty: boolean
  /** The PBI has loaded (copy link / INVEST need it). */
  isLoaded: boolean
  /** The PBI could not be loaded (not found / error): no item actions (INVEST, copy link). */
  isMissing?: boolean
  /** ai.use: offer the INVEST review (hidden without the permission). */
  canInvest: boolean
  /** The form keeps an initiative or a user story (else Update is disabled, like create). */
  canSave?: boolean
  saving: boolean
  generating: boolean
  onInvest: () => void
  onCopyLink: () => void
  onEdit: () => void
  onCancelEdit: () => void
  onSave: () => void
}

/** Footer of the PBI detail modal: INVEST, then Cancel / Update while editing, else Copy link / Close / Edit. */
export function PbiDetailFooter(props: PbiDetailFooterProps) {
  const { t } = useLanguage()
  const ui = useUiLabels()
  const close = useModalClose()
  const confirm = useConfirm()

  // Cancel returns to the read view (not closing the modal); unsaved edits ask first.
  async function cancelEdit() {
    if (props.isDirty) {
      const ok = await confirm({ title: ui.unsavedTitle, message: ui.unsavedMessage, confirmLabel: ui.discard, cancelLabel: t.cancel, variant: "warning" })
      if (!ok) return
    }
    props.onCancelEdit()
  }

  return (
    <>
      {props.canInvest && !props.isMissing ? (
        <Button variant="secondary" onClick={props.onInvest} disabled={!props.isLoaded} className="mr-auto" leftIcon={<span aria-hidden="true">🤖</span>}>
          {t.aiInvestReview}
        </Button>
      ) : (
        <span className="mr-auto" />
      )}
      {props.isEditing ? (
        <>
          <Button variant="secondary" onClick={() => void cancelEdit()}>
            {t.cancel}
          </Button>
          <Button onClick={props.onSave} loading={props.saving} disabled={props.generating || props.canSave === false}>
            {t.update}
          </Button>
        </>
      ) : (
        <>
          {!props.isMissing && (
            <Button variant="ghost" onClick={props.onCopyLink} disabled={!props.isLoaded} leftIcon={<Link2 className="h-4 w-4" />}>
              {t.backlogCopyLink}
            </Button>
          )}
          <Button variant="secondary" onClick={close}>
            {t.close}
          </Button>
          {props.canEdit && (
            <Button onClick={props.onEdit} leftIcon={<Pencil className="h-4 w-4" />}>
              {t.edit}
            </Button>
          )}
        </>
      )}
    </>
  )
}
