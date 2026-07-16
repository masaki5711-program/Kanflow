"use client"

import { useCallback, useEffect, useState } from "react"
import { useLanguage } from "@/lib/language-context"
import { useConfirm } from "@/components/confirm-dialog"
import { BilingualButton } from "@/components/bilingual-button"
import { streamTranslate } from "@/lib/streaming-translate"

interface DailyScrumNote {
  id: string
  sprintId: string
  date: string
  content: string
  author: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

interface Props {
  projectId: string
  sprintId: string
  sprintStartDate: string
  sprintEndDate: string
  readOnly?: boolean
}

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function formatDate(iso: string, locale: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" })
}

/**
 * Daily Scrum notes panel inside each SprintCard.
 * - Add form is always visible at the top.
 * - Active notes listed below.
 * - Archived notes hidden in a collapsible block at the bottom.
 */
export default function DailyScrumPanel({ projectId, sprintId, sprintStartDate, sprintEndDate, readOnly = false }: Props) {
  const { t, language } = useLanguage()
  const confirm = useConfirm()
  const locale = language === "ja" ? "ja-JP" : language === "id" ? "id-ID" : "en-US"

  const [notes, setNotes] = useState<DailyScrumNote[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<{ date: string; content: string }>({ date: todayISO(), content: "" })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{ date: string; content: string }>({ date: todayISO(), content: "" })
  const [showArchived, setShowArchived] = useState(false)
  const [translatingNew, setTranslatingNew] = useState(false)
  const [translatingEdit, setTranslatingEdit] = useState(false)

  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/sprints/${sprintId}/daily-scrums`)
      if (res.ok) {
        const data: DailyScrumNote[] = await res.json()
        setNotes(data)
      }
    } finally {
      setLoading(false)
    }
  }, [projectId, sprintId])

  useEffect(() => {
    fetchNotes()
  }, [fetchNotes])

  async function handleBilingualizeNew() {
    if (!form.content.trim() || translatingNew) return
    setTranslatingNew(true)
    try {
      await streamTranslate(form.content.trim(), (acc) => setForm((f) => ({ ...f, content: acc })))
    } catch {
      alert(t.bilingualizeFailed)
    } finally {
      setTranslatingNew(false)
    }
  }

  async function handleBilingualizeEdit() {
    if (!editForm.content.trim() || translatingEdit) return
    setTranslatingEdit(true)
    try {
      await streamTranslate(editForm.content.trim(), (acc) => setEditForm((f) => ({ ...f, content: acc })))
    } catch {
      alert(t.bilingualizeFailed)
    } finally {
      setTranslatingEdit(false)
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.content.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/sprints/${sprintId}/daily-scrums`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: form.date, content: form.content.trim() }),
      })
      if (res.ok) {
        setForm({ date: todayISO(), content: "" })
        fetchNotes()
      } else {
        const err = await res.json().catch(() => null)
        alert(err?.error || t.error)
      }
    } finally {
      setSaving(false)
    }
  }

  function startEdit(note: DailyScrumNote) {
    setEditingId(note.id)
    setEditForm({
      date: new Date(note.date).toISOString().slice(0, 10),
      content: note.content,
    })
  }

  async function handleUpdate(noteId: string) {
    if (!editForm.content.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/sprints/${sprintId}/daily-scrums/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: editForm.date, content: editForm.content.trim() }),
      })
      if (res.ok) {
        setEditingId(null)
        fetchNotes()
      } else {
        const err = await res.json().catch(() => null)
        alert(err?.error || t.error)
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(noteId: string) {
    if (!(await confirm({
      message: t.sprintDailyScrumDeleteConfirm,
      confirmLabel: t.delete,
      cancelLabel: t.cancel,
      variant: "danger",
    }))) return
    const res = await fetch(`/api/projects/${projectId}/sprints/${sprintId}/daily-scrums/${noteId}`, {
      method: "DELETE",
    })
    if (res.ok) fetchNotes()
  }

  async function handleArchive(noteId: string, archived: boolean) {
    const res = await fetch(`/api/projects/${projectId}/sprints/${sprintId}/daily-scrums/${noteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived }),
    })
    if (res.ok) fetchNotes()
  }

  const minDate = sprintStartDate.slice(0, 10)
  const maxDate = sprintEndDate.slice(0, 10)
  const activeNotes = notes.filter((n) => !n.archivedAt)
  const archivedNotes = notes.filter((n) => n.archivedAt)

  function renderNoteRow(n: DailyScrumNote, archived: boolean) {
    return (
      <li key={n.id} className={`bg-gray-50 border border-gray-100 rounded-lg ${archived ? "opacity-60" : ""}`}>
        {editingId === n.id ? (
          <div className="p-3 space-y-2">
            <input
              type="date"
              value={editForm.date}
              min={minDate}
              max={maxDate}
              onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
              className="px-2 py-1 text-sm border border-gray-300 rounded"
            />
            <div className="flex items-center justify-end">
              <BilingualButton
                onClick={handleBilingualizeEdit}
                disabled={!editForm.content.trim()}
                translating={translatingEdit}
              />
            </div>
            <textarea
              value={editForm.content}
              onChange={(e) => setEditForm({ ...editForm, content: e.target.value.slice(0, 2000) })}
              rows={8}
              maxLength={2000}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 resize-y min-h-[160px]"
            />
            <div className="text-[10px] text-gray-400 text-right">{editForm.content.length} / 2000</div>
            <div className="flex gap-2">
              <button
                onClick={() => handleUpdate(n.id)}
                disabled={saving}
                className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? t.saving : t.save}
              </button>
              <button
                onClick={() => setEditingId(null)}
                className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200"
              >
                {t.cancel}
              </button>
            </div>
          </div>
        ) : (
          <div className="p-3 group">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-teal-700">{formatDate(n.date, locale)}</span>
                {n.author && <span className="text-gray-400">{n.author}</span>}
              </div>
              {!readOnly && (
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                  {!archived && (
                    <button
                      onClick={() => startEdit(n)}
                      className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                      title={t.edit}
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/>
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={() => handleArchive(n.id, !archived)}
                    className="p-1 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded"
                    title={archived ? t.sprintDailyScrumUnarchive : t.sprintDailyScrumArchive}
                  >
                    {archived ? (
                      <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 17a1 1 0 01-.707-.293l-5-5a1 1 0 011.414-1.414L9 13.586V4a1 1 0 112 0v9.586l3.293-3.293a1 1 0 011.414 1.414l-5 5A1 1 0 0110 17z" clipRule="evenodd" transform="rotate(180 10 10)"/>
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M4 3a2 2 0 100 4h12a2 2 0 100-4H4z"/>
                        <path fillRule="evenodd" d="M3 8h14v7a2 2 0 01-2 2H5a2 2 0 01-2-2V8zm5 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" clipRule="evenodd"/>
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={() => handleDelete(n.id)}
                    className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                    title={t.delete}
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2h12a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM4.118 7.243l.882 9.704A2 2 0 006.99 19h6.02a2 2 0 001.99-2.053l.882-9.704a.5.5 0 00-.497-.543H4.615a.5.5 0 00-.497.543z" clipRule="evenodd"/>
                    </svg>
                  </button>
                </div>
              )}
            </div>
            <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{n.content}</p>
          </div>
        )}
      </li>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-4 h-4 text-teal-500" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm0 2a6 6 0 110 12 6 6 0 010-12zm0 1a1 1 0 00-1 1v4a1 1 0 00.293.707l2.828 2.828a1 1 0 101.414-1.414L11 9.586V6a1 1 0 00-1-1z"/>
        </svg>
        <h4 className="text-sm font-semibold text-gray-700">{t.sprintDailyScrum}</h4>
        <span className="text-xs text-gray-400">{activeNotes.length}{archivedNotes.length > 0 ? ` (+${archivedNotes.length})` : ""}</span>
      </div>

      {/* Add form — always visible at the top of the panel */}
      {!readOnly && (
        <form onSubmit={handleAdd} className="mb-4 p-3 bg-teal-50/50 border border-teal-200 rounded-lg space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-teal-800 whitespace-nowrap">{t.sprintDailyScrumDatePlaceholder}</label>
              <input
                type="date"
                value={form.date}
                min={minDate}
                max={maxDate}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="px-2 py-1 text-sm border border-teal-200 rounded focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
                required
              />
            </div>
            <BilingualButton
              onClick={handleBilingualizeNew}
              disabled={!form.content.trim()}
              translating={translatingNew}
            />
          </div>
          <textarea
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value.slice(0, 2000) })}
            rows={8}
            maxLength={2000}
            placeholder={t.sprintDailyScrumContentPlaceholder}
            className="w-full px-3 py-2 border border-teal-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 resize-y min-h-[160px]"
          />
          <div className="text-[10px] text-teal-700/70 text-right">{form.content.length} / 2000</div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving || !form.content.trim()}
              className="px-3 py-1.5 bg-teal-600 text-white rounded text-xs font-medium hover:bg-teal-700 disabled:opacity-50"
            >
              {saving ? t.saving : t.add}
            </button>
          </div>
        </form>
      )}

      {/* Active notes */}
      {loading ? (
        <p className="text-xs text-gray-400 py-3 text-center">{t.loading}</p>
      ) : activeNotes.length === 0 ? (
        <p className="text-xs text-gray-400 py-3 text-center">{t.sprintDailyScrumEmpty}</p>
      ) : (
        <ul className="space-y-2">{activeNotes.map((n) => renderNoteRow(n, false))}</ul>
      )}

      {/* Archived notes — collapsible at the bottom */}
      {archivedNotes.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg
              className={`w-3.5 h-3.5 transition-transform ${showArchived ? "rotate-90" : ""}`}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd"/>
            </svg>
            <span>{t.sprintDailyScrumArchived} ({archivedNotes.length})</span>
          </button>
          {showArchived && (
            <ul className="space-y-2 mt-2">{archivedNotes.map((n) => renderNoteRow(n, true))}</ul>
          )}
        </div>
      )}
    </div>
  )
}
