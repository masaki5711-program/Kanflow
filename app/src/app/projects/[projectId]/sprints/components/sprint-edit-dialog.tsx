"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useLanguage } from "@/lib/language-context"
import { useOverlayClose } from "@/lib/use-overlay-close"

interface SprintLite {
  id: string
  sprintName: string
  startDate: string
  endDate: string
  sprintGoal: string | null
  capacity: number
}

interface Props {
  projectId: string
  sprint: SprintLite
  onClose: () => void
  onSaved?: () => void
}

function toDateInput(iso: string): string {
  if (!iso) return ""
  return iso.slice(0, 10)
}

export default function SprintEditDialog({ projectId, sprint, onClose, onSaved }: Props) {
  const { t } = useLanguage()
  const router = useRouter()
  const [form, setForm] = useState({
    sprintName: sprint.sprintName,
    startDate: toDateInput(sprint.startDate),
    endDate: toDateInput(sprint.endDate),
    sprintGoal: sprint.sprintGoal ?? "",
    capacity: sprint.capacity,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/sprints/${sprint.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sprintName: form.sprintName.trim(),
          startDate: form.startDate,
          endDate: form.endDate,
          sprintGoal: form.sprintGoal.trim() || null,
          capacity: Number(form.capacity) || 0,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        setError(typeof err?.error === "string" ? err.error : t.error)
        return
      }
      onSaved?.()
      router.refresh()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const overlay = useOverlayClose(onClose)

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
      {...overlay}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900">{t.sprintEditTitle}</h3>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.sprintName}</label>
            <input
              type="text"
              value={form.sprintName}
              onChange={(e) => setForm({ ...form, sprintName: e.target.value })}
              required
              maxLength={200}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.sprintStartDate ?? "開始"}</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.sprintEndDate ?? "終了"}</label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.sprintGoal}</label>
            <textarea
              value={form.sprintGoal}
              onChange={(e) => setForm({ ...form, sprintGoal: e.target.value })}
              rows={3}
              maxLength={5000}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-y"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.sprintCapacity}</label>
            <input
              type="number"
              value={form.capacity}
              onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) || 0 })}
              min={0}
              className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              disabled={saving || !form.sprintName.trim() || !form.startDate || !form.endDate}
              className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? t.saving : t.save}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
