"use client"

import { useEffect, useId, useMemo, useRef } from "react"
import { CloudUpload, FileIcon, X } from "lucide-react"
import { IconButton, cn } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { ATTACHMENT_ACCEPT, MAX_ATTACHMENTS, formatFileSize, isImageType } from "./types"
import { useFileIntake } from "./use-file-intake"

interface Props {
  /** Files chosen so far (uploaded after the request is created). */
  files: File[]
  onChange: (files: File[]) => void
  disabled?: boolean
  /** Shown when more than MAX_ATTACHMENTS are chosen. */
  onTooMany: () => void
}

/**
 * Images / files for a new IceBox request: click to choose (several at once),
 * drag & drop onto the box, or paste a screenshot (Ctrl+V) anywhere in the
 * form. Images show a thumbnail; each can be removed before saving.
 */
export function IceboxFilePicker({ files, onChange, disabled = false, onTooMany }: Props) {
  const { t } = useLanguage()
  const inputRef = useRef<HTMLInputElement>(null)
  const labelId = useId()
  const add = (incoming: File[]) => {
    const room = MAX_ATTACHMENTS - files.length
    if (incoming.length > room) onTooMany()
    if (room > 0) onChange([...files, ...incoming.slice(0, room)])
  }
  const intake = useFileIntake(add, disabled)
  const previews = useObjectUrls(files)
  const full = files.length >= MAX_ATTACHMENTS

  return (
    <div role="group" aria-labelledby={labelId} data-icebox-file-picker="">
      <p id={labelId} className="mb-1.5 text-body font-medium text-fg">{t.iceboxAttachLabel}</p>
      {files.length > 0 && (
        <ul className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {files.map((file, i) => (
            <li key={`${file.name}-${i}`} className="flex items-center gap-2.5 rounded-ui-md border border-border bg-surface-muted px-2.5 py-2">
              {isImageType(file.type) && previews[i] ? (
                // Local object URL of the chosen file (not uploaded yet).
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previews[i]} alt={file.name} width={40} height={40} className="h-10 w-10 shrink-0 rounded-ui-sm object-cover" />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-ui-sm bg-surface-sunken">
                  <FileIcon aria-hidden="true" className="h-5 w-5 text-fg-muted" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-caption font-medium text-fg" title={file.name}>{file.name}</span>
                <span className="block text-caption text-fg-muted">{formatFileSize(file.size)}</span>
              </span>
              <IconButton
                size="sm"
                label={t.iceboxAttachRemove.replace("{name}", file.name)}
                icon={<X className="h-4 w-4" />}
                disabled={disabled}
                onClick={() => onChange(files.filter((_, j) => j !== i))}
              />
            </li>
          ))}
        </ul>
      )}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ATTACHMENT_ACCEPT}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          add(Array.from(e.target.files ?? []))
          e.target.value = ""
        }}
      />
      <button
        type="button"
        disabled={disabled || full}
        onClick={() => inputRef.current?.click()}
        {...intake.dropProps}
        className={cn(
          "flex min-h-14 w-full flex-col items-center justify-center gap-1 rounded-ui-md border-2 border-dashed px-3 py-3 text-body text-fg-muted transition-colors hover:border-primary hover:bg-primary-soft/40 hover:text-primary-strong disabled:cursor-not-allowed disabled:opacity-50",
          intake.dragActive ? "border-primary bg-primary-soft/60 text-primary-strong" : "border-border-strong",
        )}
      >
        <span className="inline-flex items-center gap-2">
          <CloudUpload aria-hidden="true" className="h-5 w-5" />
          {t.iceboxAttachDrop}
        </span>
        <span className="text-caption">{t.iceboxAttachmentHint.replace("{count}", String(files.length))}</span>
      </button>
    </div>
  )
}

/** Object URLs for image previews, revoked when the files change or on unmount. */
function useObjectUrls(files: readonly File[]): (string | null)[] {
  const urls = useMemo(() => files.map((f) => (isImageType(f.type) ? URL.createObjectURL(f) : null)), [files])
  useEffect(() => () => urls.forEach((u) => u && URL.revokeObjectURL(u)), [urls])
  return urls
}
