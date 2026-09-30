"use client"

import { useState } from "react"
import { useLanguage } from "@/lib/language-context"
import { GlossaryHint, I18nText } from "@/components/i18n-text"
import { Button, Field, Modal, Textarea } from "@/components/ui"
import ModalCancelButton from "./modal-cancel-button"
import type { EntityI18n } from "@/lib/translation/types"

interface Props {
  taskName: string | null
  /** Both-language text of the task (viewer-locale name in the header). */
  taskI18n?: EntityI18n
  onClose: () => void
  onConfirm: (comment: string) => void
}

/** Asks for an optional completion comment before marking a task done. */
export default function TaskCompleteDialog({ taskName, taskI18n, onClose, onConfirm }: Props) {
  const { t } = useLanguage()
  const [comment, setComment] = useState("")

  return (
    <Modal
      open
      onClose={onClose}
      title={<><span className="text-success" aria-hidden="true">✓ </span>{t.sprintTaskCompleteTitle}</>}
      description={taskName ? <I18nText i18n={taskI18n} field="taskName" original={taskName} noBadge /> : undefined}
      isDirty={comment.trim().length > 0}
      footer={
        <>
          <ModalCancelButton />
          <Button variant="secondary" onClick={() => onConfirm("")}>{t.sprintTaskCompleteSkip}</Button>
          <Button onClick={() => onConfirm(comment.trim())} disabled={!comment.trim()}>{t.sprintTaskCompleteTitle}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t.sprintTaskCompletionComment} hint={t.sprintTaskCompleteHint}>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={4} data-autofocus />
        </Field>
        <GlossaryHint />
      </div>
    </Modal>
  )
}
