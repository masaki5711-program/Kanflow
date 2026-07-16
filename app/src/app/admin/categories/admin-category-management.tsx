"use client"

import { useEffect, useState, useCallback } from "react"
import { useLanguage } from "@/lib/language-context"

interface SectionRef {
  id: string
  name: string
}

interface AdminCategory {
  id: string
  name: string
  color: string
  sortOrder: number
  sectionId: string | null
  section: SectionRef | null
  _count: { assignments: number }
}

const COLOR_OPTIONS = ["gray", "blue", "green", "amber", "rose", "violet", "cyan"] as const

const COLOR_DOT: Record<string, string> = {
  gray: "bg-gray-400",
  blue: "bg-blue-500",
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  violet: "bg-violet-500",
  cyan: "bg-cyan-500",
}

export function AdminCategoryManagement() {
  const { t } = useLanguage()
  const [sections, setSections] = useState<SectionRef[]>([])
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<{ name: string; color: string; sortOrder: number; sectionId: string | "" }>({
    name: "",
    color: "gray",
    sortOrder: 0,
    sectionId: "",
  })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [secRes, catRes] = await Promise.all([
      fetch("/api/admin/sections"),
      fetch("/api/admin/categories"),
    ])
    if (secRes.ok) setSections((await secRes.json()).map((s: SectionRef) => ({ id: s.id, name: s.name })))
    if (catRes.ok) setCategories(await catRes.json())
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  function resetForm() {
    setForm({ name: "", color: "gray", sortOrder: 0, sectionId: "" })
    setEditingId(null)
    setShowForm(false)
    setError(null)
  }

  function startEdit(c: AdminCategory) {
    setForm({
      name: c.name,
      color: c.color,
      sortOrder: c.sortOrder,
      sectionId: c.sectionId ?? "",
    })
    setEditingId(c.id)
    setShowForm(true)
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const url = editingId ? `/api/admin/categories/${editingId}` : "/api/admin/categories"
      const method = editingId ? "PATCH" : "POST"
      const body = {
        name: form.name.trim(),
        color: form.color,
        sortOrder: form.sortOrder,
        sectionId: form.sectionId === "" ? null : form.sectionId,
      }
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
      await fetchAll()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("このカテゴリを削除しますか？")) return
    const res = await fetch(`/api/admin/categories/${id}`, { method: "DELETE" })
    if (res.ok) await fetchAll()
  }

  // Group categories: global first, then by section.
  const grouped: { title: string; sectionId: string | null; categories: AdminCategory[] }[] = []
  const globalCats = categories.filter((c) => c.sectionId === null)
  if (globalCats.length || categories.length === 0) {
    grouped.push({ title: "全体（Global）", sectionId: null, categories: globalCats })
  }
  for (const s of sections) {
    grouped.push({
      title: s.name,
      sectionId: s.id,
      categories: categories.filter((c) => c.sectionId === s.id),
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">カテゴリ管理（Admin）</h1>
        {!showForm && (
          <button
            onClick={() => {
              resetForm()
              setShowForm(true)
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium shadow-sm"
          >
            + カテゴリ追加
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 mb-6 space-y-3">
          <h2 className="text-lg font-semibold mb-2">
            {editingId ? "カテゴリ編集" : "カテゴリ追加"}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">名前</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">スコープ</label>
              <select
                value={form.sectionId}
                onChange={(e) => setForm({ ...form, sectionId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              >
                <option value="">全体（Global）</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">色</label>
              <div className="flex flex-wrap gap-2">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setForm({ ...form, color: c })}
                    className={`w-7 h-7 rounded-full ${COLOR_DOT[c]} ${
                      form.color === c ? "ring-2 ring-offset-2 ring-gray-400" : ""
                    } transition-all`}
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">並び順</label>
              <input
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) || 0 })}
                className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
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
      ) : (
        <div className="space-y-5">
          {grouped.map((g) => (
            <div key={g.sectionId ?? "global"}>
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-sm font-semibold text-gray-700">{g.title}</h2>
                <span className="text-xs text-gray-400">({g.categories.length})</span>
              </div>
              {g.categories.length === 0 ? (
                <p className="text-xs text-gray-400 ml-2">—</p>
              ) : (
                <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                  {g.categories.map((c) => (
                    <div key={c.id} className="flex items-center justify-between px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${COLOR_DOT[c.color] ?? COLOR_DOT.gray}`} />
                        <span className="text-sm font-medium text-gray-900">{c.name}</span>
                        <span className="text-xs text-gray-400">{c._count.assignments} projects</span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => startEdit(c)}
                          className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                        >
                          {t.edit}
                        </button>
                        <button
                          onClick={() => handleDelete(c.id)}
                          className="text-red-500 hover:text-red-700 text-xs font-medium"
                        >
                          {t.sectionDelete}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
