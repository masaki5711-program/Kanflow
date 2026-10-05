"use client"

import { useId, useRef, type ChangeEvent, type DragEvent } from "react"
import { Camera, CloudUpload, Trash2 } from "lucide-react"
import { useFileIntake } from "@/components/file-intake/use-file-intake"
import { IconButton, cn, useConfirm } from "@/components/ui"
import {
  IMPROVEMENT_MAX_PHOTOS_PER_PHASE,
  IMPROVEMENT_PHOTO_ACCEPT,
  PHOTO_PHASES,
  improvementPhotoUrl,
  type PhotoPhase,
} from "@/lib/improvement/constants"
import { useLanguage } from "@/lib/language-context"
import type { ImprovementItem, ImprovementPhoto } from "./improvement-types"
import { SectionFrame, type Announce } from "./section-frame"
import { usePhotoUpload } from "./use-photo-upload"
import type { BoardWriter } from "./use-improvement-board"

interface Props {
  projectId: string
  item: ImprovementItem
  canEdit: boolean
  write: BoardWriter
  announce: Announce
}

/** 写真: 改善前 / 改善後 side by side; each takes the picker, drag & drop and Ctrl+V paste. */
export function PhotoSection({ projectId, item, canEdit, write, announce }: Props) {
  const { t } = useLanguage()
  return (
    <SectionFrame title={t.kzSectionPhotos} icon={<Camera aria-hidden="true" className="h-5 w-5 text-primary" />}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PHOTO_PHASES.map((phase) => (
          <PhaseColumn
            key={phase}
            phase={phase}
            projectId={projectId}
            itemId={item.id}
            photos={item.photos.filter((p) => p.phase === phase)}
            canEdit={canEdit}
            write={write}
            announce={announce}
          />
        ))}
      </div>
    </SectionFrame>
  )
}

interface ColumnProps {
  phase: PhotoPhase
  projectId: string
  itemId: string
  photos: readonly ImprovementPhoto[]
  canEdit: boolean
  write: BoardWriter
  announce: Announce
}

function PhaseColumn({ phase, projectId, itemId, photos, canEdit, write, announce }: ColumnProps) {
  const { t } = useLanguage()
  const confirm = useConfirm()
  const labelId = useId()
  const hintId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const upload = usePhotoUpload(itemId, phase, photos.length, write, announce)
  const full = photos.length >= IMPROVEMENT_MAX_PHOTOS_PER_PHASE
  const blocked = !canEdit || upload.busy || full
  const intake = useFileIntake(upload.add, blocked)
  const label = phase === "before" ? t.kzPhotoBefore : t.kzPhotoAfter
  // A file dropped while blocked must not make the browser open it in place of the page.
  const swallow = (e: DragEvent) => {
    if (blocked && Array.from(e.dataTransfer?.types ?? []).includes("Files")) e.preventDefault()
  }

  async function remove(photo: ImprovementPhoto) {
    const ok = await confirm({ message: t.kzPhotoDeleteConfirm.replace("{name}", photo.originalName), confirmLabel: t.delete, cancelLabel: t.cancel, variant: "danger" })
    if (!ok) return
    const result = await write(itemId, `/photos/${photo.id}`, { method: "DELETE" })
    announce(result.ok ? t.kzSaved : result.message, result.ok ? "success" : "error")
  }

  function pick(e: ChangeEvent<HTMLInputElement>) {
    upload.add(Array.from(e.target.files ?? []))
    e.target.value = ""
  }

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      data-photo-phase={phase}
      onPaste={intake.onPaste}
      {...intake.dropProps}
      onDragOver={(e) => { intake.dropProps.onDragOver(e); swallow(e) }}
      onDrop={(e) => { intake.dropProps.onDrop(e); swallow(e) }}
      className={cn("rounded-ui-md border p-2", intake.dragActive ? "border-primary bg-primary-soft/50" : "border-border bg-surface-muted")}
    >
      <p id={labelId} className="mb-2 flex items-center justify-between text-body font-semibold text-fg">
        {label}
        <span id={hintId} className="text-caption font-normal text-fg-muted">
          {t.kzPhotoHint.replace("{count}", String(photos.length)).replace("{max}", String(IMPROVEMENT_MAX_PHOTOS_PER_PHASE))}
        </span>
      </p>
      {photos.length === 0 ? (
        <p className="py-3 text-center text-caption text-fg-muted">{t.kzPhotoNone}</p>
      ) : (
        <ul className="grid grid-cols-3 gap-1.5">
          {photos.map((p) => (
            <li key={p.id} className="group relative">
              <a href={improvementPhotoUrl(projectId, itemId, p.id)} target="_blank" rel="noopener noreferrer" aria-label={t.kzPhotoOpen.replace("{name}", p.originalName)} className="block">
                {/* eslint-disable-next-line @next/next/no-img-element -- authenticated API image */}
                <img src={improvementPhotoUrl(projectId, itemId, p.id)} alt={p.originalName} className="aspect-square w-full rounded-ui-sm border border-border object-cover" />
              </a>
              {canEdit && (
                <IconButton
                  size="sm"
                  variant="danger"
                  label={t.kzPhotoDelete.replace("{name}", p.originalName)}
                  icon={<Trash2 className="h-4 w-4" />}
                  onClick={() => void remove(p)}
                  className="absolute right-1 top-1 bg-surface/90"
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <>
          <input ref={inputRef} type="file" multiple accept={IMPROVEMENT_PHOTO_ACCEPT} className="hidden" tabIndex={-1} aria-hidden="true" onChange={pick} data-testid={`photo-input-${phase}`} />
          <button
            type="button"
            disabled={blocked}
            aria-busy={upload.busy || undefined}
            aria-describedby={hintId}
            onClick={() => inputRef.current?.click()}
            className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-ui-md border-2 border-dashed border-border-strong px-2 py-2 text-caption text-fg-muted transition-colors hover:border-primary hover:text-primary-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CloudUpload aria-hidden="true" className="h-5 w-5 shrink-0" />
            {upload.busy ? t.kzPhotoUploading : `${label}: ${t.kzPhotoDrop}`}
          </button>
        </>
      )}
      {upload.errors.length > 0 && (
        <ul className="mt-2 space-y-0.5 rounded-ui-sm bg-danger-soft px-2 py-1.5 text-caption text-danger-strong">
          {upload.errors.map((m, i) => <li key={`${i}-${m}`}>{m}</li>)}
        </ul>
      )}
    </div>
  )
}
