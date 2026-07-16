"use client"

import { useEffect, useState, useCallback } from "react"
import { useLanguage } from "@/lib/language-context"

interface Section {
  id: string
  name: string
  description: string | null
  sortOrder: number
  _count: { users: number; projects: number; categories: number }
}

export function SectionManagement() {
  const { t } = useLanguage()
  const [sections, setSections] = useState<Section[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: "", description: "", sortOrder: 0 })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchSections = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/sections")
      if (res.ok) setSections(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSections()
  }, [fetchSections])

  function resetForm() {
    setForm({ name: "", description: "", sortOrder: 0 })
    setEditingId(null)
    setShowForm(false)
    setError(null)
  }

  function startEdit(s: Section) {
    setForm({ name: s.name, description: s.description ?? "", sortOrder: s.sortOrder })
    setEditingId(s.id)
    setShowForm(true)
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const url = editingId ? `/api/admin/sections/${editingId}` : "/api/admin/sections"
      const method = editingId ? "PATCH" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || null,
          sortOrder: form.sortOrder,
        }),
      })
      if (res.status === 409) {
        setError(t.sectionDuplicateName)
        return
      }
      if (!res.ok) {
        setError(t.error)
        return
      }
      resetForm()
      await fetchSections()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t.sectionDeleteConfirm)) return
    const res = await fetch(`/api/admin/sections/${id}`, { method: "DELETE" })
    if (res.ok) await fetchSections()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t.sectionAdminTitle}</h1>
        {!showForm && (
          <button
            onClick={() => {
              resetForm()
              setShowForm(true)
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium shadow-sm"
          >
            + {t.sectionAdd}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 mb-6 space-y-3">
          <h2 className="text-lg font-semibold mb-2">{editingId ? t.sectionEdit : t.sectionAdd}</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.sectionName}</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              maxLength={100}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.sectionDescription}</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              maxLength={500}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.sectionSortOrder}</label>
            <input
              type="number"
              value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) || 0 })}
              className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={saving || !form.name.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
            >
              {editingId ? t.update : t.add}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium"
            >
              {t.cancel}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">{t.loading}</p>
      ) : sections.length === 0 ? (
        <p className="text-sm text-gray-400">No sections yet.</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-2 text-left">{t.sectionName}</th>
                <th className="px-4 py-2 text-left">{t.sectionDescription}</th>
                <th className="px-4 py-2 text-center">{t.sectionUserCount}</th>
                <th className="px-4 py-2 text-center">{t.sectionProjectCount}</th>
                <th className="px-4 py-2 text-center">{t.sectionCategoryCount}</th>
                <th className="px-4 py-2 text-center">{t.sectionSortOrder}</th>
                <th className="px-4 py-2 text-right">—</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sections.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3 font-medium text-gray-900">{s.name}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-[280px] truncate">{s.description ?? "—"}</td>
                  <td className="px-4 py-3 text-center">{s._count.users}</td>
                  <td className="px-4 py-3 text-center">{s._count.projects}</td>
                  <td className="px-4 py-3 text-center">{s._count.categories}</td>
                  <td className="px-4 py-3 text-center text-gray-500">{s.sortOrder}</td>
                  <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                    <button
                      onClick={() => startEdit(s)}
                      className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                    >
                      {t.edit}
                    </button>
                    <button
                      onClick={() => handleDelete(s.id)}
                      className="text-red-500 hover:text-red-700 text-xs font-medium"
                    >
                      {t.sectionDelete}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
