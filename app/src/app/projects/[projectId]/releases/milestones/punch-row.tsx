"use client"

import { useState } from "react"
import { Pencil, Trash2, TriangleAlert } from "lucide-react"
import { Badge, IconButton, cn, useConfirm } from "@/components/ui"
import { fillTemplate } from "@/lib/fill-template"
import { formatLongDate } from "@/lib/format-date"
import { useLanguage } from "@/lib/language-context"
import { MS_MAX_PUNCH_PHOTOS, MS_PHOTO_ACCEPT, PUNCH_STATUSES, punchPhotoUrl } from "@/lib/milestones/constants"
import { isPunchOverdue } from "@/lib/milestones/summary"
import type { Announce } from "../improvement/section-frame"
import { FileDrop } from "./file-drop"
import { punchStatusLabel, type Member, type PunchItem } from "./milestone-types"
import { PunchForm, punchFormOf, punchPatch } from "./punch-form"
import type { BoardWriter } from "./use-milestone-board"
import { useUploads } from "./use-uploads"

export interface PunchRowContext {
  projectId: string
  todayKey: string
  members: readonly Member[]
  stageOptions: ReadonlyArray<{ id: string; label: string }>
  stageNames: ReadonlyMap<string, string>
  canEdit: boolean
  canTrack: boolean
  write: BoardWriter
  announce: Announce
}

const STATUS_ACTIVE: Record<string, string> = {
  open: "border-fg-muted bg-surface-muted text-fg",
  in_progress: "border-info bg-info-soft text-info",
  done: "border-success bg-success-soft text-success-strong",
}

/** One 残課題: status buttons, photos (picker / drag / Ctrl+V), inline edit, delete (PO / SM). */
export function PunchRow({ item, ctx }: { item: PunchItem; ctx: PunchRowContext }) {
  const { t, language } = useLanguage()
  const confirm = useConfirm()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const overdue = isPunchOverdue(item, ctx.todayKey)
  const uploads = useUploads({
    path: `/punch/${item.id}/photos`,
    room: MS_MAX_PUNCH_PHOTOS - item.photos.length,
    imageOnly: true,
    write: ctx.write,
    announce: ctx.announce,
    doneMessage: t.msPhotoUploaded,
  })

  async function run(path: string, init: Parameters<BoardWriter>[1], success: string): Promise<boolean> {
    setSaving(true)
    const result = await ctx.write(path, init)
    setSaving(false)
    ctx.announce(result.ok ? success : result.message, result.ok ? "success" : "error")
    return result.ok
  }

  async function remove(path: string, name: string) {
    if (await confirm({ message: fillTemplate(t.msDeleteConfirm, { name }), confirmLabel: t.delete, cancelLabel: t.cancel, variant: "danger" })) await run(path, { method: "DELETE" }, t.msSaved)
  }

  const setStatus = (status: string) =>
    run(`/punch/${item.id}`, { method: "PATCH", json: { status } }, fillTemplate(t.msPunchStatusChanged, { name: item.title, status: punchStatusLabel(status, t) }))

  return (
    <li className={cn("rounded-ui-md border p-3", overdue ? "border-danger/60 bg-danger-soft/30" : item.status === "done" ? "border-border bg-surface-muted" : "border-border bg-surface")} data-testid="ms-punch-row">
      <div className="flex flex-wrap items-start gap-2">
        <p className={cn("min-w-0 flex-1 text-body font-semibold", item.status === "done" ? "text-fg-muted line-through" : "text-fg")}>{item.title}</p>
        {overdue && (
          <Badge tone="danger">
            <TriangleAlert aria-hidden="true" className="mr-0.5 inline h-3 w-3" />
            {t.msPunchOverdue}
          </Badge>
        )}
        {ctx.canTrack && <IconButton size="sm" label={fillTemplate(t.msPunchEdit, { name: item.title })} icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing((v) => !v)} />}
        {ctx.canEdit && <IconButton size="sm" variant="danger" label={fillTemplate(t.msPunchDelete, { name: item.title })} icon={<Trash2 className="h-4 w-4" />} onClick={() => void remove(`/punch/${item.id}`, item.title)} />}
      </div>
      {item.detail && <p className="mt-0.5 whitespace-pre-wrap text-caption text-fg-muted">{item.detail}</p>}
      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-caption text-fg-muted">
        <span>
          {t.msPunchAssignee}: {item.assigneeName ?? t.msPunchAssigneeNone}
        </span>
        {item.dueDate && <span className={overdue ? "font-semibold text-danger-strong" : undefined}>{t.msPunchDue}: {formatLongDate(item.dueDate, language, { utc: true })}</span>}
        {item.planItemId && ctx.stageNames.get(item.planItemId) && <span>{ctx.stageNames.get(item.planItemId)}</span>}
        {item.closedAt && <span>{fillTemplate(t.msPunchClosedAt, { date: formatLongDate(item.closedAt, language) })}</span>}
      </p>
      <div role="group" aria-label={`${t.msStatus}: ${item.title}`} className="mt-2 flex flex-wrap gap-1.5">
        {PUNCH_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={item.status === s}
            disabled={!ctx.canTrack || saving || item.status === s}
            onClick={() => void setStatus(s)}
            className={cn(
              "min-h-9 rounded-ui-md border px-3 text-caption font-medium transition-colors disabled:cursor-default",
              item.status === s ? STATUS_ACTIVE[s] : "border-border text-fg-muted hover:border-primary hover:text-primary-strong",
            )}
          >
            {punchStatusLabel(s, t)}
          </button>
        ))}
      </div>
      <FileDrop label={t.msPhotoAdd} accept={MS_PHOTO_ACCEPT} disabled={!ctx.canTrack} busy={uploads.busy} errors={uploads.errors} onFiles={uploads.add} paste testId={`ms-punch-photos-${item.id}`}>
        {item.photos.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {item.photos.map((p) => (
              <li key={p.id} className="relative">
                <a href={punchPhotoUrl(ctx.projectId, item.id, p.id)} target="_blank" rel="noopener noreferrer" aria-label={fillTemplate(t.msPhotoOpen, { name: p.originalName })}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- authenticated API image */}
                  <img src={punchPhotoUrl(ctx.projectId, item.id, p.id)} alt={p.originalName} className="h-16 w-16 rounded-ui-sm border border-border object-cover" />
                </a>
                {ctx.canTrack && (
                  <IconButton
                    size="sm"
                    variant="danger"
                    label={fillTemplate(t.msPhotoDelete, { name: p.originalName })}
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    onClick={() => void remove(`/punch/${item.id}/photos/${p.id}`, p.originalName)}
                    className="absolute -right-1 -top-1 bg-surface/90"
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </FileDrop>
      {editing && (
        <PunchForm
          initial={punchFormOf(item)}
          members={ctx.members}
          stages={ctx.stageOptions}
          saving={saving}
          onCancel={() => setEditing(false)}
          onSave={async (v) => {
            if (await run(`/punch/${item.id}`, { method: "PATCH", json: punchPatch(v) }, t.msSaved)) setEditing(false)
          }}
        />
      )}
    </li>
  )
}
