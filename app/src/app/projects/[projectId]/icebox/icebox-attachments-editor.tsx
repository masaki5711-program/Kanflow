"use client"

import { useId, useRef, useState, type ChangeEvent } from "react"
import { IconButton, useToast, useConfirm } from "@/components/ui"
import { apiFetch } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { CloudUpload, FileIcon, Paperclip, Trash2 } from "lucide-react"
import { cn } from "@/components/ui"
import { uploadIceboxFiles, useFileIntake } from "./use-file-intake"
import {
  ATTACHMENT_ACCEPT,
  MAX_ATTACHMENTS,
  attachmentUrl,
  formatFileSize,
  isImageType,
  type IceboxAttachment,
} from "./types"

interface Props {
  projectId: string
  itemId: string
  attachments: IceboxAttachment[]
  onChange: (next: IceboxAttachment[]) => void
  /** Upload/delete are immediate server writes — lets the page refresh its list. */
  onServerChange: () => void
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Attachment list + uploader inside the IceBox edit dialog. */
export function IceboxAttachmentsEditor({ projectId, itemId, attachments, onChange, onServerChange }: Props) {
  const { t } = useLanguage()
  const toast = useToast()
  const confirm = useConfirm()
  const inputRef = useRef<HTMLInputElement>(null)
  const headingId = useId()
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const isFull = attachments.length >= MAX_ATTACHMENTS

  /** Several files at once (picker, drop or pasted screenshot), within the per-item limit. */
  async function uploadMany(incoming: File[]) {
    if (incoming.length === 0 || uploading) return
    const room = MAX_ATTACHMENTS - attachments.length
    if (incoming.length > room) toast.error(t.iceboxAttachTooMany.replace("{max}", String(MAX_ATTACHMENTS)))
    const batch = incoming.slice(0, Math.max(0, room))
    if (batch.length === 0) return
    setUploading(true)
    try {
      const { saved, failed } = await uploadIceboxFiles(projectId, itemId, batch)
      if (saved.length > 0) {
        onChange([...attachments, ...saved])
        onServerChange()
      }
      if (failed.length > 0) {
        toast.error(
          failed.length === 1 ? failed[0].message : t.iceboxAttachPartialFailed.replace("{n}", String(failed.length)).replace("{names}", failed.map((f) => f.name).join(", ")),
          { title: t.iceboxUploadFailed },
        )
      }
    } finally {
      setUploading(false)
    }
  }
  const intake = useFileIntake((files) => void uploadMany(files), uploading || isFull)

  function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    void uploadMany(Array.from(e.target.files ?? []))
    if (inputRef.current) inputRef.current.value = ""
  }

  async function handleDelete(att: IceboxAttachment) {
    const ok = await confirm({
      message: t.iceboxAttachmentDeleteConfirm.replace("{name}", att.originalName),
      confirmLabel: t.delete,
      cancelLabel: t.cancel,
      variant: "danger",
    })
    if (!ok) return
    setDeletingId(att.id)
    try {
      await apiFetch(attachmentUrl(projectId, itemId, att.id), { method: "DELETE" })
      onChange(attachments.filter((a) => a.id !== att.id))
      onServerChange()
    } catch (err) {
      toast.error(errorMessage(err), { title: t.iceboxDeleteFailed })
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div role="group" aria-labelledby={headingId} onPaste={intake.onPaste}>
      <p id={headingId} className="mb-2 flex items-center gap-1.5 text-body font-medium text-fg">
        <Paperclip className="h-4 w-4 text-fg-muted" />
        {t.dashboardAttachments}
      </p>
      {attachments.length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {attachments.map((att) => (
            <li key={att.id} className="flex items-center gap-3 rounded-ui-md border border-border bg-surface-muted px-3 py-2">
              {isImageType(att.mimeType) ? (
                // Authenticated API URL → plain <img> (next/image cannot fetch it).
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={attachmentUrl(projectId, itemId, att.id)}
                  alt={att.originalName}
                  className="h-10 w-10 rounded-ui-sm object-cover"
                  width={40}
                  height={40}
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-ui-sm bg-surface-sunken">
                  <FileIcon className="h-5 w-5 text-fg-muted" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-caption font-medium text-fg" title={att.originalName}>
                  {att.originalName}
                </p>
                <p className="text-caption text-fg-muted">{formatFileSize(att.fileSize)}</p>
              </div>
              <IconButton
                label={t.iceboxAttachmentDelete.replace("{name}", att.originalName)}
                size="sm"
                icon={<Trash2 className="h-4 w-4 text-danger" />}
                loading={deletingId === att.id}
                onClick={() => handleDelete(att)}
              />
            </li>
          ))}
        </ul>
      )}
      <input ref={inputRef} type="file" multiple onChange={handleUpload} className="hidden" accept={ATTACHMENT_ACCEPT} tabIndex={-1} aria-hidden="true" />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading || isFull}
        aria-busy={uploading || undefined}
        {...intake.dropProps}
        className={cn(
          "flex min-h-11 w-full items-center justify-center gap-2 rounded-ui-md border-2 border-dashed py-3 text-body text-fg-muted hover:border-primary hover:bg-primary-soft/40 hover:text-primary-strong disabled:cursor-not-allowed disabled:opacity-50",
          intake.dragActive ? "border-primary bg-primary-soft/60 text-primary-strong" : "border-border-strong",
        )}
      >
        <CloudUpload className="h-5 w-5" />
        {uploading ? t.iceboxUploading : t.iceboxAttachDrop}
      </button>
      <p className="mt-1.5 text-center text-caption text-fg-muted" aria-live="polite">
        {t.iceboxAttachmentHint.replace("{count}", String(attachments.length))}
      </p>
    </div>
  )
}
