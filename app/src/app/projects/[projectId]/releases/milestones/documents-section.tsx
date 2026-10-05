"use client"

import { useState } from "react"
import { CircleCheck, Circle, FileText, Plus, Trash2 } from "lucide-react"
import { Button, Field, IconButton, Input, cn, useConfirm } from "@/components/ui"
import { fillTemplate } from "@/lib/fill-template"
import { formatLongDate } from "@/lib/format-date"
import { useLanguage } from "@/lib/language-context"
import { MS_DOCUMENT_ACCEPT, MS_MAX_DOCUMENT_FILES, MS_NAME_MAX, documentFileUrl } from "@/lib/milestones/constants"
import type { Announce } from "../improvement/section-frame"
import { FileDrop } from "./file-drop"
import type { HandoverDocument, MilestoneBoard } from "./milestone-types"
import type { BoardWriter } from "./use-milestone-board"
import { useUploads } from "./use-uploads"

interface Props {
  board: MilestoneBoard
  projectId: string
  write: BoardWriter
  announce: Announce
}

type Run = (path: string, init: Parameters<BoardWriter>[1], success: string) => Promise<boolean>

/** 引き渡し資料 checklist: 揃った / 未提出 toggle, files per document, add / delete (PO / SM). */
export function DocumentsSection({ board, projectId, write, announce }: Props) {
  const { t } = useLanguage()
  const confirm = useConfirm()
  const { canEdit, canTrack } = board.permissions

  const run: Run = async (path, init, success) => {
    const result = await write(path, init)
    announce(result.ok ? success : result.message, result.ok ? "success" : "error")
    return result.ok
  }

  const remove = async (path: string, name: string) => {
    if (await confirm({ message: fillTemplate(t.msDeleteConfirm, { name }), confirmLabel: t.delete, cancelLabel: t.cancel, variant: "danger" })) await run(path, { method: "DELETE" }, t.msSaved)
  }

  return (
    <div className="space-y-3">
      {board.documents.length === 0 ? (
        <p className="text-caption text-fg-muted">{t.msDocsNone}</p>
      ) : (
        <ul className="space-y-2">
          {board.documents.map((d) => (
            <DocumentRow key={d.id} doc={d} projectId={projectId} canEdit={canEdit} canTrack={canTrack} write={write} announce={announce} run={run} remove={remove} />
          ))}
        </ul>
      )}
      {canEdit && <AddDocument onAdd={(name) => run("/documents", { method: "POST", json: { name } }, t.msSaved)} />}
    </div>
  )
}

interface RowProps {
  doc: HandoverDocument
  projectId: string
  canEdit: boolean
  canTrack: boolean
  write: BoardWriter
  announce: Announce
  run: Run
  remove: (path: string, name: string) => Promise<void>
}

function DocumentRow({ doc, projectId, canEdit, canTrack, write, announce, run, remove }: RowProps) {
  const { t, language } = useLanguage()
  const received = doc.status === "received"
  const uploads = useUploads({ path: `/documents/${doc.id}/files`, room: MS_MAX_DOCUMENT_FILES - doc.files.length, imageOnly: false, write, announce, doneMessage: t.msFileUploaded })
  const toggle = () => run(`/documents/${doc.id}`, { method: "PATCH", json: { status: received ? "pending" : "received" } }, t.msSaved)
  return (
    <li className={cn("rounded-ui-md border p-3", received ? "border-success/40 bg-success-soft/20" : "border-border bg-surface")} data-testid="ms-doc-row">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={received}
          aria-label={fillTemplate(t.msDocToggle, { name: doc.name })}
          disabled={!canTrack}
          onClick={() => void toggle()}
          className={cn(
            "inline-flex min-h-10 items-center gap-1.5 rounded-ui-md border px-3 text-caption font-semibold transition-colors disabled:cursor-default",
            received ? "border-success bg-success-soft text-success-strong" : "border-border-strong text-fg-muted hover:border-primary",
          )}
        >
          {received ? <CircleCheck aria-hidden="true" className="h-4 w-4" /> : <Circle aria-hidden="true" className="h-4 w-4" />}
          {received ? t.msDocReceived : t.msDocPending}
        </button>
        <span className="min-w-0 flex-1 text-body font-semibold text-fg">{doc.name}</span>
        {received && doc.receivedAt && (
          <span className="text-caption text-fg-muted">{fillTemplate(t.msDocReceivedBy, { name: doc.receivedByName ?? "—", date: formatLongDate(doc.receivedAt, language) })}</span>
        )}
        {canEdit && <IconButton size="sm" variant="danger" label={fillTemplate(t.msDocDelete, { name: doc.name })} icon={<Trash2 className="h-4 w-4" />} onClick={() => void remove(`/documents/${doc.id}`, doc.name)} />}
      </div>
      <FileDrop label={t.msDocAttach} accept={MS_DOCUMENT_ACCEPT} disabled={!canTrack} busy={uploads.busy} errors={uploads.errors} onFiles={uploads.add} testId={`ms-doc-files-${doc.id}`}>
        {doc.files.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {doc.files.map((f) => (
              <li key={f.id} className="inline-flex items-center gap-1 rounded-ui-sm border border-border bg-surface px-2 py-1 text-caption">
                <FileText aria-hidden="true" className="h-3.5 w-3.5 text-fg-muted" />
                <a href={documentFileUrl(projectId, doc.id, f.id)} target="_blank" rel="noopener noreferrer" className="max-w-[14rem] truncate text-primary-strong hover:underline" aria-label={fillTemplate(t.msDocFileOpen, { name: f.originalName })}>
                  {f.originalName}
                </a>
                {canTrack && (
                  <IconButton size="sm" label={fillTemplate(t.msDocFileDelete, { name: f.originalName })} icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => void remove(`/documents/${doc.id}/files/${f.id}`, f.originalName)} />
                )}
              </li>
            ))}
          </ul>
        )}
      </FileDrop>
    </li>
  )
}

function AddDocument({ onAdd }: { onAdd: (name: string) => Promise<boolean> }) {
  const { t } = useLanguage()
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!name.trim() || saving) return
        setSaving(true)
        if (await onAdd(name.trim())) setName("")
        setSaving(false)
      }}
    >
      <Field label={t.msDocName} className="flex-1">
        <Input value={name} maxLength={MS_NAME_MAX} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Button type="submit" variant="secondary" leftIcon={<Plus className="h-4 w-4" />} loading={saving} disabled={!name.trim()}>
        {t.msDocAdd}
      </Button>
    </form>
  )
}
