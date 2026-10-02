"use client"

import { useId, useRef, type ChangeEvent, type DragEvent } from "react"
import { CloudUpload, Paperclip, X } from "lucide-react"
import { useFileIntake } from "@/components/file-intake/use-file-intake"
import { Field, IconButton, Textarea, cn } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { PBI_ATTACHMENT_ACCEPT, PBI_MAX_ATTACHMENTS } from "@/lib/pbi-attachments"
import { PbiAttachmentList } from "./pbi-attachment-list"
import type { PbiAttachmentsController } from "./types"

interface Props {
  value: string
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void
  /** Attachment area under the text; omitted = text only. */
  attachments?: PbiAttachmentsController
  disabled?: boolean
}

/**
 * The 参考資料 field: free text plus files / images. Files can be chosen
 * (keyboard: the picker button), dropped anywhere on the field, or pasted
 * (Ctrl+V of a screenshot or copied files) into the text or the area — a
 * plain-text paste still goes into the text as usual.
 */
export function PbiReferenceField({ value, onChange, attachments, disabled = false }: Props) {
  const { t } = useLanguage()
  const full = !!attachments && attachments.items.length >= PBI_MAX_ATTACHMENTS
  const blocked = disabled || !attachments || attachments.busy || full
  const intake = useFileIntake((files) => attachments?.add(files), blocked)
  // While uploads are blocked (full / busy) a file dropped here must not make
  // the browser open it in place of the page (the unsaved form would be lost).
  const swallow = (e: DragEvent) => {
    if (attachments && blocked && Array.from(e.dataTransfer?.types ?? []).includes("Files")) e.preventDefault()
  }

  return (
    <div
      onPaste={intake.onPaste}
      {...intake.dropProps}
      onDragOver={(e) => {
        intake.dropProps.onDragOver(e)
        swallow(e)
      }}
      onDrop={(e) => {
        intake.dropProps.onDrop(e)
        swallow(e)
      }}
      data-pbi-reference-field=""
    >
      <Field label={t.backlogReferenceDoc}>
        <Textarea value={value} onChange={onChange} rows={8} autoGrow className="min-h-[200px]" />
      </Field>
      {attachments && <AttachmentArea attachments={attachments} disabled={disabled} full={full} dragActive={intake.dragActive} />}
    </div>
  )
}

interface AreaProps {
  attachments: PbiAttachmentsController
  disabled: boolean
  full: boolean
  dragActive: boolean
}

function AttachmentArea({ attachments, disabled, full, dragActive }: AreaProps) {
  const { t } = useLanguage()
  const inputRef = useRef<HTMLInputElement>(null)
  const labelId = useId()
  const hintId = useId()
  const { items, busy, errors } = attachments

  function handlePick(e: ChangeEvent<HTMLInputElement>) {
    attachments.add(Array.from(e.target.files ?? []))
    e.target.value = ""
  }

  return (
    <div role="group" aria-labelledby={labelId} className="mt-2 space-y-2">
      <p id={labelId} className="flex items-center gap-1.5 text-caption font-medium text-fg-muted">
        <Paperclip aria-hidden="true" className="h-3.5 w-3.5" />
        {t.pbiAttachLabel}
      </p>
      <PbiAttachmentList items={items} onRemove={attachments.remove} disabled={disabled || busy} />
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={PBI_ATTACHMENT_ACCEPT}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handlePick}
      />
      <button
        type="button"
        disabled={disabled || busy || full}
        aria-busy={busy || undefined}
        aria-describedby={hintId}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex min-h-11 w-full items-center justify-center gap-2 rounded-ui-md border-2 border-dashed px-3 py-2.5 text-body text-fg-muted transition-colors hover:border-primary hover:bg-primary-soft/40 hover:text-primary-strong disabled:cursor-not-allowed disabled:opacity-50",
          dragActive ? "border-primary bg-primary-soft/60 text-primary-strong" : "border-border-strong",
        )}
      >
        <CloudUpload aria-hidden="true" className="h-5 w-5 shrink-0" />
        {busy ? t.pbiAttachUploading : t.pbiAttachDrop}
      </button>
      <p id={hintId} className="text-center text-caption text-fg-muted">
        {t.pbiAttachHint.replace("{count}", String(items.length)).replace("{max}", String(PBI_MAX_ATTACHMENTS))}
      </p>
      <div aria-live="polite" aria-atomic="true">
        {errors.length > 0 && (
          <div className="flex items-start gap-2 rounded-ui-md border border-danger/40 bg-danger-soft px-3 py-2 text-caption text-danger">
            <ul className="min-w-0 flex-1 space-y-0.5">
              {errors.map((message, i) => (
                <li key={`${i}-${message}`} className="break-words">{message}</li>
              ))}
            </ul>
            <IconButton size="sm" label={t.pbiAttachClearErrors} icon={<X className="h-4 w-4" />} onClick={attachments.clearErrors} />
          </div>
        )}
      </div>
    </div>
  )
}
