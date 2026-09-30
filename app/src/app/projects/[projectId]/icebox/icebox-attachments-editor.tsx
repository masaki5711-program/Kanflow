"use client"

import { useId, useRef, useState, type ChangeEvent } from "react"
import { IconButton, useToast, useConfirm } from "@/components/ui"
import { apiFetch } from "@/hooks"
import { compressImageFile } from "@/lib/image-compress"
import { useLanguage } from "@/lib/language-context"
import { CloudUpload, FileIcon, Paperclip, Trash2 } from "lucide-react"
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

  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.files?.[0]
    if (!raw) return
    setUploading(true)
    try {
      const file = raw.type.startsWith("image/") ? await compressImageFile(raw) : raw
      const formData = new FormData()
      formData.append("file", file)
      const saved = await apiFetch<IceboxAttachment>(`/api/projects/${projectId}/icebox/${itemId}/attachments`, {
        method: "POST",
        body: formData,
      })
      onChange([...attachments, saved])
      onServerChange()
    } catch (err) {
      toast.error(errorMessage(err), { title: t.iceboxUploadFailed })
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
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
    <div role="group" aria-labelledby={headingId}>
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
      <input ref={inputRef} type="file" onChange={handleUpload} className="hidden" accept={ATTACHMENT_ACCEPT} tabIndex={-1} aria-hidden="true" />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading || isFull}
        aria-busy={uploading || undefined}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-ui-md border-2 border-dashed border-border-strong py-3 text-body text-fg-muted hover:border-primary hover:bg-primary-soft/40 hover:text-primary-strong disabled:cursor-not-allowed disabled:opacity-50"
      >
        <CloudUpload className="h-5 w-5" />
        {uploading ? t.iceboxUploading : t.dashboardUploadFile}
      </button>
      <p className="mt-1.5 text-center text-caption text-fg-muted" aria-live="polite">
        {t.iceboxAttachmentHint.replace("{count}", String(attachments.length))}
      </p>
    </div>
  )
}
