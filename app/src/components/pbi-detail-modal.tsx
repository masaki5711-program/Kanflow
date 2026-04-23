"use client"

import { useEffect, useState } from "react"
import { useLanguage } from "@/lib/language-context"

interface PbiDetail {
  id: string
  displayId: number
  initiative: string | null
  epic: string | null
  userStory: string | null
  acceptanceCriteria: string | null
  referenceDoc: string | null
  workloadScore: number
  status: string
  notReadyReason: string | null
  poNote: string | null
  assignedPo: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  productGoal: { id: string; title: string } | null
  iceboxItem: { id: string; displayId: number; request: string } | null
}

interface Props {
  projectId: string
  pbiId: string
  onClose: () => void
}

const statusClass: Record<string, string> = {
  not_ready: "bg-amber-50 text-amber-700 border-amber-200",
  ready: "bg-blue-50 text-blue-700 border-blue-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
}

/**
 * Read-only centered modal showing the full details of a Product Backlog Item.
 * Used by non-PO members and from sprint planning / sprint cards so anyone
 * can inspect a PBI without editing it.
 */
export default function PbiDetailModal({ projectId, pbiId, onClose }: Props) {
  const { t, pt } = useLanguage()
  const [item, setItem] = useState<PbiDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/projects/${projectId}/backlog/${pbiId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data: PbiDetail) => {
        if (!cancelled) setItem(data)
      })
      .catch(() => { if (!cancelled) setError(t.error) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [projectId, pbiId, t.error])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 shrink-0 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
              <span className="font-mono">#{item?.displayId ?? "—"}</span>
              {item && (
                <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border ${statusClass[item.status] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
                  {item.status === "ready" && "Ready"}
                  {item.status === "not_ready" && "Not Ready"}
                  {item.status === "completed" && "Completed"}
                </span>
              )}
              {item?.productGoal?.title && (
                <span className="inline-flex items-center text-[11px] text-indigo-600">→ {item.productGoal.title}</span>
              )}
            </div>
            <h3 className="text-lg font-bold text-gray-900 truncate">
              {item?.initiative || item?.userStory || t.view}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
            title={t.close}
            aria-label={t.close}
          >
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <p className="text-sm text-gray-400 py-8 text-center">{t.loading}</p>
          ) : error || !item ? (
            <p className="text-sm text-red-500 py-8 text-center">{error ?? t.error}</p>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label={pt.backlogInitiative} value={item.initiative} />
                <Field label={pt.backlogEpic} value={item.epic} />
              </div>
              <Field label={pt.backlogUserStory} value={item.userStory} multiline />
              <Field label={pt.backlogAcceptanceCriteria} value={item.acceptanceCriteria} multiline />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field
                  label={pt.backlogWorkloadScore}
                  value={item.workloadScore != null ? String(item.workloadScore) : null}
                />
                <Field label={pt.rolePO} value={item.assignedPo} />
                {item.iceboxItem && (
                  <Field
                    label={pt.iceboxTitle}
                    value={`#${item.iceboxItem.displayId} ${item.iceboxItem.request}`}
                  />
                )}
              </div>
              <Field label={t.view + ": " + "POメモ"} value={item.poNote} multiline />
              {item.status === "not_ready" && item.notReadyReason && (
                <Field label="Not Ready reason" value={item.notReadyReason} multiline />
              )}
              <Field label="Reference" value={item.referenceDoc} multiline />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 flex justify-end shrink-0 bg-gray-50/60 rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
          >
            {t.close}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  multiline,
}: {
  label: string
  value: string | null
  multiline?: boolean
}) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
      {value && value.trim() ? (
        <p className={`text-sm text-gray-800 ${multiline ? "whitespace-pre-wrap leading-relaxed" : ""} bg-gray-50 rounded-lg px-3 py-2 min-h-[38px]`}>
          {value}
        </p>
      ) : (
        <p className="text-sm text-gray-300 bg-gray-50 rounded-lg px-3 py-2 min-h-[38px]">—</p>
      )}
    </div>
  )
}
