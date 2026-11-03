"use client"

import { useId, useState } from "react"
import { Button, Field, Modal, Spinner, Textarea } from "@/components/ui"
import { DialogCancel } from "@/components/plan-lesson-rules/dialog-cancel"
import { useLanguage } from "@/lib/language-context"
import type { SnapshotView } from "./types"

interface Props {
  snapshot: SnapshotView
  /** Which record this acts on (the finalized date), shown under the title. */
  label: string
  busy: boolean
  onClose: () => void
  onSubmit: (reason: string) => void
}

/** Switch a snapshot in or out of learning — always with a reason (it goes into the project's history). */
export function LearningSwitchDialog({ snapshot, label, busy, onClose, onSubmit }: Props) {
  const { t } = useLanguage()
  const fieldId = useId()
  const [reason, setReason] = useState("")
  const [error, setError] = useState(false)
  const turningOff = snapshot.includeInLearning

  function submit() {
    if (busy) return
    if (!reason.trim()) {
      setError(true)
      requestAnimationFrame(() => document.getElementById(fieldId)?.focus())
      return
    }
    onSubmit(reason.trim())
  }

  return (
    <Modal
      open
      onClose={onClose}
      isDirty={reason.trim() !== ""}
      title={turningOff ? t.pacLearningTitleOff : t.pacLearningTitleOn}
      description={label}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <DialogCancel />
          <Button onClick={submit} variant={turningOff ? "danger" : "primary"} aria-disabled={busy || undefined} aria-busy={busy || undefined} leftIcon={busy ? <Spinner size="sm" /> : undefined}>
            {turningOff ? t.pacLearningTurnOff : t.pacLearningTurnOn}
          </Button>
        </div>
      }
    >
      <Field id={fieldId} label={t.pacLearningReason} hint={t.pacLearningReasonHint} error={error ? t.pacLearningReasonRequired : undefined} required>
        <Textarea
          value={reason}
          rows={3}
          maxLength={500}
          onChange={(e) => {
            setReason(e.target.value)
            setError(false)
          }}
        />
      </Field>
    </Modal>
  )
}
