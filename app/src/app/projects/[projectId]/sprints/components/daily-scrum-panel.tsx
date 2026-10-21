"use client"

import { useState } from "react"
import { useLanguage } from "@/lib/language-context"
import { DisclosureChevron, EmptyState, SkeletonLines, useConfirm, useToast } from "@/components/ui"
import { apiFetch, useApiQuery } from "@/hooks"
import { messageOf } from "../lib/errors"
import { defaultDateInRange, toLocalIsoDate } from "../lib/locale"
import DailyScrumForm, { type DailyScrumDraft } from "./daily-scrum-form"
import DailyScrumNote, { type DailyScrumNoteData } from "./daily-scrum-note"
import { Clock, MessageSquareText } from "lucide-react"
interface Props {
  projectId: string
  sprintId: string
  sprintStartDate: string
  sprintEndDate: string
  readOnly?: boolean
}

/**
 * Daily Scrum notes inside a sprint card: add form on top, active notes,
 * archived notes collapsible at the bottom. Archive/delete are optimistic.
 */
export default function DailyScrumPanel({ projectId, sprintId, sprintStartDate, sprintEndDate, readOnly = false }: Props) {
  const { t, language } = useLanguage()
  const toast = useToast()
  const confirm = useConfirm()
  const url = `/api/projects/${projectId}/sprints/${sprintId}/daily-scrums`
  const { data: notes = [], isLoading, refetch, mutate } = useApiQuery<DailyScrumNoteData[]>(url, { toastOnError: true })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const minDate = sprintStartDate.slice(0, 10)
  const maxDate = sprintEndDate.slice(0, 10)
  const activeNotes = notes.filter((n) => !n.archivedAt)
  const archivedNotes = notes.filter((n) => n.archivedAt)

  async function save(method: "POST" | "PATCH", target: string, draft: DailyScrumDraft): Promise<boolean> {
    try {
      await apiFetch(target, { method, json: draft })
      refetch()
      return true
    } catch (err) {
      toast.error(messageOf(err, t.error), { title: t.sprintDailyScrumSaveFailed })
      return false
    }
  }

  /** Git activity of the sprint's PBIs; null when Git is off or the lookup fails (the button just does nothing). */
  async function loadGitDraft(): Promise<string | null> {
    try {
      const out = await apiFetch<{ enabled: boolean; text: string }>(`/api/projects/${projectId}/sprints/${sprintId}/git?view=draft&lang=${language}`)
      return out.enabled ? out.text : null
    } catch {
      toast.error(t.sprintUxGitDraftFailed)
      return null
    }
  }

  async function handleUpdate(noteId: string, draft: DailyScrumDraft): Promise<boolean> {
    const ok = await save("PATCH", `${url}/${noteId}`, draft)
    if (ok) setEditingId(null)
    return ok
  }

  async function optimistic(next: DailyScrumNoteData[], request: () => Promise<unknown>) {
    const snapshot = notes
    mutate(next)
    try {
      await request()
      refetch()
    } catch (err) {
      mutate(snapshot)
      toast.error(messageOf(err, t.error), { title: t.sprintDailyScrumSaveFailed })
    }
  }

  async function handleDelete(noteId: string) {
    const ok = await confirm({
      message: t.sprintDailyScrumDeleteConfirm, confirmLabel: t.delete, cancelLabel: t.cancel, variant: "danger",
    })
    if (!ok) return
    await optimistic(notes.filter((n) => n.id !== noteId), () => apiFetch(`${url}/${noteId}`, { method: "DELETE" }))
  }

  function handleArchive(noteId: string, archived: boolean) {
    const archivedAt = archived ? new Date().toISOString() : null
    void optimistic(
      notes.map((n) => (n.id === noteId ? { ...n, archivedAt } : n)),
      () => apiFetch(`${url}/${noteId}`, { method: "PATCH", json: { archived } }),
    )
  }

  function renderNote(n: DailyScrumNoteData) {
    return (
      <DailyScrumNote key={n.id} note={n} readOnly={readOnly} isEditing={editingId === n.id}
        minDate={minDate} maxDate={maxDate} onStartEdit={() => setEditingId(n.id)} onCancelEdit={() => setEditingId(null)}
        onUpdate={(draft) => handleUpdate(n.id, draft)} onArchive={(a) => handleArchive(n.id, a)}
        onDelete={() => void handleDelete(n.id)} />
    )
  }

  return (
    <section aria-labelledby={`daily-heading-${sprintId}`} className="bg-surface border border-border rounded-ui-sm p-4">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-4 h-4 text-primary" />
        <h4 id={`daily-heading-${sprintId}`} className="text-body font-semibold text-fg">{t.sprintDailyScrum}</h4>
        <span className="text-caption text-fg-muted">
          {activeNotes.length}{archivedNotes.length > 0 ? ` (+${archivedNotes.length})` : ""}
        </span>
      </div>

      {!readOnly && (
        <DailyScrumForm className="mb-4 p-3 bg-primary-soft/30 border border-primary/20 rounded-ui-sm"
          initial={{ date: defaultDateInRange(toLocalIsoDate(), minDate, maxDate), content: "" }} minDate={minDate} maxDate={maxDate}
          submitLabel={t.add} resetOnSuccess onDraft={loadGitDraft} onSubmit={(draft) => save("POST", url, draft)} />
      )}

      {isLoading ? (
        <SkeletonLines lines={3} label={t.loading} />
      ) : activeNotes.length === 0 ? (
        <EmptyState compact headingLevel={4} icon={<MessageSquareText className="w-6 h-6" />} title={t.sprintDailyScrumEmpty} />
      ) : (
        <ul className="space-y-2">{activeNotes.map(renderNote)}</ul>
      )}

      {archivedNotes.length > 0 && (
        <div className="mt-4">
          <button type="button" onClick={() => setShowArchived((v) => !v)} aria-expanded={showArchived}
            className="flex items-center gap-1.5 min-h-8 text-caption text-fg-muted hover:text-fg transition-colors">
            <DisclosureChevron open={showArchived} className="w-3.5 h-3.5" />
            <span>{t.sprintDailyScrumArchived} ({archivedNotes.length})</span>
          </button>
          {showArchived && <ul className="space-y-2 mt-2">{archivedNotes.map(renderNote)}</ul>}
        </div>
      )}
    </section>
  )
}
