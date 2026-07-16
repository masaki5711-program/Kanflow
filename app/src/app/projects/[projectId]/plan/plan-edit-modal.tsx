"use client"

import { useEffect, useState } from "react"
import { useLanguage } from "@/lib/language-context"
import type { PlanItem } from "./lib/plan-utils"
import { formatYmd } from "./lib/plan-utils"

interface Props {
  open: boolean
  initial: PlanItem | null
  parentOptions: { id: string; name: string; depth: number }[]
  onClose: () => void
  onSave: (patch: Partial<PlanItem>) => Promise<void>
  onDelete?: () => Promise<void>
}

export default function PlanEditModal({ open, initial, parentOptions, onClose, onSave, onDelete }: Props) {
  const { t } = useLanguage()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [plannedStart, setPlannedStart] = useState("")
  const [plannedEnd, setPlannedEnd] = useState("")
  const [actualStart, setActualStart] = useState("")
  const [actualEnd, setActualEnd] = useState("")
  const [status, setStatus] = useState("not_started")
  const [parentId, setParentId] = useState<string>("")
  const [isMilestone, setIsMilestone] = useState(false)
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !initial) return
    setName(initial.name)
    setDescription(initial.description ?? "")
    setPlannedStart(formatYmd(initial.plannedStart))
    setPlannedEnd(formatYmd(initial.plannedEnd))
    setActualStart(initial.actualStart ? formatYmd(initial.actualStart) : "")
    setActualEnd(initial.actualEnd ? formatYmd(initial.actualEnd) : "")
    setStatus(initial.status)
    setParentId(initial.parentId ?? "")
    setIsMilestone(initial.isMilestone)
    setNotes(initial.notes ?? "")
  }, [open, initial])

  if (!open || !initial) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave({
        name,
        description: description || null,
        plannedStart,
        plannedEnd,
        actualStart: actualStart || null,
        actualEnd: actualEnd || null,
        status,
        parentId: parentId || null,
        isMilestone,
        notes: notes || null,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        role="dialog"
        aria-modal="true"
      >
        <div className="px-6 py-4 border-b border-gray-100 shrink-0">
          <h3 className="text-lg font-bold text-gray-900">{t.planTitle} - {t.edit}</h3>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 overflow-y-auto flex-1 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t.planNamePlaceholder}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={255}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t.planPlannedStart}</label>
              <input
                type="date"
                value={plannedStart}
                onChange={(e) => setPlannedStart(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t.planPlannedEnd}</label>
              <input
                type="date"
                value={plannedEnd}
                onChange={(e) => setPlannedEnd(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t.planActualStart}</label>
              <input
                type="date"
                value={actualStart}
                onChange={(e) => setActualStart(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t.planActualEnd}</label>
              <input
                type="date"
                value={actualEnd}
                onChange={(e) => setActualEnd(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t.planStatus}</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="not_started">{t.planStatusNotStarted}</option>
                <option value="in_progress">{t.planStatusInProgress}</option>
                <option value="done">{t.planStatusDone}</option>
                <option value="on_hold">{t.planStatusOnHold}</option>
                <option value="delayed">{t.planStatusDelayed}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Parent</label>
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">— (root)</option>
                {parentOptions
                  .filter((p) => p.id !== initial.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {"\u00a0\u00a0".repeat(p.depth)}{p.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={isMilestone}
              onChange={(e) => setIsMilestone(e.target.checked)}
            />
            {t.planIsMilestone}
          </label>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t.planNotes}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex items-center justify-between pt-2">
            {onDelete ? (
              <button
                type="button"
                onClick={async () => {
                  if (!confirm(t.planConfirmDelete)) return
                  await onDelete()
                }}
                className="px-3 py-1.5 text-sm text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg"
              >
                {t.delete}
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium"
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium disabled:bg-indigo-300"
              >
                {t.update}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
