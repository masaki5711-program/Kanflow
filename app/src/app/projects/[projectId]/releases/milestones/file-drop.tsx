"use client"

import { useRef, type ChangeEvent, type DragEvent, type ReactNode } from "react"
import { CloudUpload } from "lucide-react"
import { useFileIntake } from "@/components/file-intake/use-file-intake"
import { cn } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"

interface Props {
  /** Visible label of the picker button. */
  label: string
  accept: string
  disabled: boolean
  busy: boolean
  errors: readonly string[]
  onFiles: (files: File[]) => void
  /** Accept Ctrl+V of images / files while focus is inside. */
  paste?: boolean
  testId?: string
  children?: ReactNode
}

/**
 * A drop zone around `children` plus a picker button: drag & drop, the file
 * dialog and (with `paste`) Ctrl+V all feed `onFiles`. Used for 残課題
 * photos and 引き渡し資料 files (the KAIZEN photo column, generalised).
 */
export function FileDrop({ label, accept, disabled, busy, errors, onFiles, paste = false, testId, children }: Props) {
  const { t } = useLanguage()
  const inputRef = useRef<HTMLInputElement>(null)
  const blocked = disabled || busy
  const intake = useFileIntake(onFiles, blocked)
  // A file dropped while blocked must not make the browser open it in place of the page.
  const swallow = (e: DragEvent) => {
    if (blocked && Array.from(e.dataTransfer?.types ?? []).includes("Files")) e.preventDefault()
  }

  function pick(e: ChangeEvent<HTMLInputElement>) {
    onFiles(Array.from(e.target.files ?? []))
    e.target.value = ""
  }

  return (
    <div
      onPaste={paste ? intake.onPaste : undefined}
      {...intake.dropProps}
      onDragOver={(e) => {
        intake.dropProps.onDragOver(e)
        swallow(e)
      }}
      onDrop={(e) => {
        intake.dropProps.onDrop(e)
        swallow(e)
      }}
      className={cn("rounded-ui-md", intake.dragActive && "bg-primary-soft/50 outline-2 outline-dashed outline-primary")}
      data-testid={testId}
    >
      {children}
      {!disabled && (
        <>
          <input ref={inputRef} type="file" multiple accept={accept} className="hidden" tabIndex={-1} aria-hidden="true" onChange={pick} data-testid={testId ? `${testId}-input` : undefined} />
          <button
            type="button"
            disabled={blocked}
            aria-busy={busy || undefined}
            onClick={() => inputRef.current?.click()}
            className="mt-1.5 flex min-h-10 w-full items-center justify-center gap-2 rounded-ui-md border-2 border-dashed border-border-strong px-2 py-1.5 text-caption text-fg-muted transition-colors hover:border-primary hover:text-primary-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CloudUpload aria-hidden="true" className="h-4 w-4 shrink-0" />
            {busy ? t.msPhotoUploading : label}
          </button>
        </>
      )}
      {errors.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 rounded-ui-sm bg-danger-soft px-2 py-1.5 text-caption text-danger-strong">
          {errors.map((m, i) => (
            <li key={`${i}-${m}`}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
