"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { useLanguage } from "@/lib/language-context"
import { useConfirm } from "@/components/confirm-dialog"

interface Category {
  id: string
  name: string
  color: string
  sortOrder: number
  assignments: { projectId: string }[]
}

const availableColors = [
  { value: "gray", label: "グレー" },
  { value: "red", label: "レッド" },
  { value: "orange", label: "オレンジ" },
  { value: "yellow", label: "イエロー" },
  { value: "green", label: "グリーン" },
  { value: "blue", label: "ブルー" },
  { value: "indigo", label: "インディゴ" },
  { value: "purple", label: "パープル" },
  { value: "pink", label: "ピンク" },
]

const colorDot: Record<string, string> = {
  gray: "bg-gray-400",
  red: "bg-red-500",
  orange: "bg-orange-500",
  yellow: "bg-yellow-500",
  green: "bg-green-500",
  blue: "bg-blue-500",
  indigo: "bg-indigo-500",
  purple: "bg-purple-500",
  pink: "bg-pink-500",
}

export function CategorySettings() {
  const { t } = useLanguage()
  const confirm = useConfirm()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: "", color: "blue" })
  const [editForm, setEditForm] = useState({ name: "", color: "blue" })
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  const fetchCategories = useCallback(async () => {
    const res = await fetch("/api/user/categories")
    if (res.ok) setCategories(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { fetchCategories() }, [fetchCategories])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setError("")
    setSaving(true)
    try {
      const res = await fetch("/api/user/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(typeof data.error === "string" ? data.error : t.errorCreationFailed)
        return
      }
      setForm({ name: "", color: "blue" })
      setShowCreate(false)
      fetchCategories()
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdate(categoryId: string) {
    setError("")
    setSaving(true)
    try {
      const res = await fetch(`/api/user/categories/${categoryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(typeof data.error === "string" ? data.error : t.errorUpdateFailed)
        return
      }
      setEditingId(null)
      fetchCategories()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(categoryId: string) {
    if (!await confirm({ message: t.categoryDeleteConfirm, confirmLabel: t.delete, cancelLabel: t.cancel, variant: "danger" })) return
    const res = await fetch(`/api/user/categories/${categoryId}`, { method: "DELETE" })
    if (res.ok) fetchCategories()
  }

  function startEdit(cat: Category) {
    setEditingId(cat.id)
    setEditForm({ name: cat.name, color: cat.color })
    setError("")
  }

  function renderColorPicker(value: string, onChange: (color: string) => void) {
    return (
      <div className="flex gap-2">
        {availableColors.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => onChange(c.value)}
            className={`w-6 h-6 rounded-full ${colorDot[c.value]} transition-all ${
              value === c.value ? "ring-2 ring-offset-2 ring-blue-500 scale-110" : "hover:scale-110"
            }`}
            title={c.label}
          />
        ))}
      </div>
    )
  }

  if (loading) {
    return <div className="text-center py-16 text-gray-500">{t.loading}</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link href="/" className="text-sm text-gray-400 hover:text-blue-600 transition-colors">
              {t.projectBackToList}
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{t.categorySettingsTitle}</h1>
          <p className="text-sm text-gray-500 mt-1">{t.categorySettingsDesc}</p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setError("") }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 text-sm font-medium shadow-sm shadow-blue-500/25 hover:shadow-md transition-all"
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/>
          </svg>
          {t.categoryNew}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 mb-6">
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
          </svg>
          {error}
        </div>
      )}

      {showCreate && (
        <div className="bg-white rounded-2xl shadow-lg shadow-gray-200/50 border border-gray-100 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-5">{t.categoryNew}</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.categoryCategory}</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                maxLength={50}
                placeholder={t.categoryNamePlaceholder}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-gray-300"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t.eventColor}</label>
              {renderColorPicker(form.color, (color) => setForm({ ...form, color }))}
            </div>
            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={saving} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 text-sm font-medium shadow-sm">
                {t.create}
              </button>
              <button type="button" onClick={() => setShowCreate(false)} className="px-5 py-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 text-sm font-medium">
                {t.cancel}
              </button>
            </div>
          </form>
        </div>
      )}

      {categories.length === 0 && !showCreate ? (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gray-100 mb-4">
            <svg className="w-8 h-8 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/>
            </svg>
          </div>
          <p className="text-lg font-medium text-gray-700 mb-1">{t.categoryEmpty}</p>
          <p className="text-sm text-gray-500">{t.categoryEmptyDesc}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {categories.map((cat) => (
            <div key={cat.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              {editingId === cat.id ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{t.categoryCategory}</label>
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      maxLength={50}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-2">{t.eventColor}</label>
                    {renderColorPicker(editForm.color, (color) => setEditForm({ ...editForm, color }))}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleUpdate(cat.id)} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                      {t.save}
                    </button>
                    <button onClick={() => setEditingId(null)} className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200">
                      {t.cancel}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`w-3 h-3 rounded-full ${colorDot[cat.color] ?? colorDot.gray}`} />
                    <span className="text-sm font-semibold text-gray-900">{cat.name}</span>
                    <span className="text-xs text-gray-400">
                      {`${cat.assignments.length} ${t.categoryProjects}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => startEdit(cat)}
                      className="p-2 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-all"
                      title={t.edit}
                    >
                      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/>
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(cat.id)}
                      className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-all"
                      title={t.delete}
                    >
                      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"/>
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 p-4 bg-blue-50 rounded-xl">
        <p className="text-sm text-blue-700">
          {t.categoryHelpText}
        </p>
      </div>
    </div>
  )
}
