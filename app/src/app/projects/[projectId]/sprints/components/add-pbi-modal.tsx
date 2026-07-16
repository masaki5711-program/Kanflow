"use client"

import { useEffect, useMemo, useState } from "react"
import { useLanguage } from "@/lib/language-context"
import PbiDetailModal from "@/components/pbi-detail-modal"

export interface BacklogPbi {
  id: string
  displayId: number
  initiative: string | null
  epic: string | null
  userStory: string | null
  workloadScore: number
  status: string
  productGoal?: { id: string; title: string } | null
}

interface Props {
  projectId: string
  sprintId: string
  sprintName: string
  existingPbIds: Set<string>
  pointUnit: string
  /** PO/SM/admin can create brand-new PBIs from this modal. Others get the
   *  "pick from backlog" tab only. */
  canCreate?: boolean
  onAdded: () => void
  onClose: () => void
}

export default function AddPbiModal({
  projectId,
  sprintId,
  sprintName,
  existingPbIds,
  pointUnit,
  canCreate,
  onAdded,
  onClose,
}: Props) {
  const { t, pt } = useLanguage()
  const [tab, setTab] = useState<"existing" | "new">("existing")
  const [items, setItems] = useState<BacklogPbi[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState("")
  const [detailPbiId, setDetailPbiId] = useState<string | null>(null)
  const [newForm, setNewForm] = useState({
    initiative: "",
    epic: "",
    userStory: "",
    acceptanceCriteria: "",
    workloadScore: "3",
    assignedPo: "",
  })

  useEffect(() => {
    fetch(`/api/projects/${projectId}/backlog`)
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then((data) => {
        if (Array.isArray(data.readyItems)) setItems(data.readyItems)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [projectId])

  const eligible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((it) => {
      if (existingPbIds.has(it.id)) return false
      if (q.length === 0) return true
      const hay = [
        `#${it.displayId}`,
        it.initiative ?? "",
        it.epic ?? "",
        it.userStory ?? "",
        it.productGoal?.title ?? "",
      ].join(" ").toLowerCase()
      return hay.includes(q)
    })
  }, [items, existingPbIds, query])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSubmit() {
    if (selected.size === 0) return
    setSaving(true)
    try {
      const res = await fetch(
        `/api/projects/${projectId}/sprints/${sprintId}/pbis`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pbIds: Array.from(selected) }),
        }
      )
      if (res.ok) {
        onAdded()
        onClose()
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleCreateAndAttach() {
    const trimmedStory = newForm.userStory.trim()
    const trimmedInit = newForm.initiative.trim()
    if (!trimmedStory && !trimmedInit) return
    setSaving(true)
    try {
      // Step 1: create the PBI in backlog with status=ready so it shows up
      // in the active backlog list and qualifies for sprint attachment.
      const createRes = await fetch(`/api/projects/${projectId}/backlog`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initiative: trimmedInit || null,
          epic: newForm.epic.trim() || null,
          userStory: trimmedStory || null,
          acceptanceCriteria: newForm.acceptanceCriteria.trim() || null,
          workloadScore: parseInt(newForm.workloadScore || "0", 10),
          assignedPo: newForm.assignedPo.trim() || null,
          status: "ready",
        }),
      })
      if (!createRes.ok) {
        const err = await createRes.json().catch(() => null)
        alert(err?.error ?? t.error)
        return
      }
      const created = await createRes.json()
      // Step 2: attach it to the sprint.
      const attachRes = await fetch(
        `/api/projects/${projectId}/sprints/${sprintId}/pbis`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pbIds: [created.id] }),
        }
      )
      if (attachRes.ok) {
        onAdded()
        onClose()
      } else {
        const err = await attachRes.json().catch(() => null)
        alert(err?.error ?? t.error)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 shrink-0">
          <h3 className="text-lg font-bold text-gray-900">{t.sprintAddPbiTitle}</h3>
          <p className="text-sm text-gray-500 mt-1">{sprintName}</p>
        </div>

        {/* Tabs */}
        {canCreate && (
          <div className="px-6 pt-3 border-b border-gray-100 shrink-0">
            <div className="inline-flex bg-gray-100 rounded-lg p-0.5 text-xs font-medium">
              <button
                type="button"
                onClick={() => setTab("existing")}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  tab === "existing" ? "bg-white text-blue-700 shadow" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                既存から選ぶ
              </button>
              <button
                type="button"
                onClick={() => setTab("new")}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  tab === "new" ? "bg-white text-blue-700 shadow" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                + 新規作成
              </button>
            </div>
          </div>
        )}

        {/* Search (only for existing tab) */}
        {tab === "existing" && (
        <div className="px-6 py-3 border-b border-gray-100 shrink-0">
          <div className="relative">
            <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd"/>
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.sprintAddPbiSearchPlaceholder}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-gray-300"
            />
          </div>
        </div>
        )}

        {/* List (existing tab) */}
        {tab === "existing" && (
        <div className="flex-1 overflow-y-auto px-6 py-3">
          {loading ? (
            <div className="text-center text-sm text-gray-400 py-8">{t.loading}</div>
          ) : eligible.length === 0 ? (
            <div className="text-center text-sm text-gray-400 py-8">
              {items.length === 0 ? t.sprintNoTasks : t.userNoResults}
            </div>
          ) : (
            <ul className="space-y-1.5">
              {eligible.map((pb) => {
                const isSel = selected.has(pb.id)
                return (
                  <li key={pb.id} className={`relative border rounded-lg transition-colors ${
                    isSel
                      ? "bg-blue-50 border-blue-300 ring-1 ring-blue-300"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setDetailPbiId(pb.id) }}
                      className="absolute top-2 right-2 p-1 text-gray-300 hover:text-blue-600 hover:bg-blue-50 rounded"
                      title={t.view}
                    >
                      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
                        <path fillRule="evenodd" d="M.664 10.59a1.65 1.65 0 010-1.186A10 10 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10 10 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggle(pb.id)}
                      className="w-full flex items-start gap-3 px-3 pr-10 py-2.5 text-left"
                    >
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                        isSel ? "bg-blue-600 border-blue-600" : "bg-white border-gray-300"
                      }`}>
                        {isSel && (
                          <svg className="w-3 h-3 text-white" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono text-gray-400">#{pb.displayId}</span>
                          <span className="text-sm font-semibold text-gray-800 truncate">
                            {pb.initiative || pb.userStory || "—"}
                          </span>
                          <span className="inline-flex items-center text-xs bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full">
                            {pb.workloadScore} {pointUnit}
                          </span>
                        </div>
                        {pb.epic && (
                          <p className="text-xs text-gray-500 mt-0.5 truncate">{pb.epic}</p>
                        )}
                        {pb.productGoal?.title && (
                          <p className="text-xs text-indigo-500 mt-0.5 truncate">→ {pb.productGoal.title}</p>
                        )}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        )}

        {/* New PBI form (new tab) */}
        {tab === "new" && (
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{pt.backlogInitiative}</label>
                <input type="text" value={newForm.initiative}
                  onChange={(e) => setNewForm({ ...newForm, initiative: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{pt.backlogEpic}</label>
                <input type="text" value={newForm.epic}
                  onChange={(e) => setNewForm({ ...newForm, epic: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{pt.backlogUserStory}</label>
              <textarea value={newForm.userStory}
                onChange={(e) => setNewForm({ ...newForm, userStory: e.target.value })}
                rows={4}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-y" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{pt.backlogAcceptanceCriteria}</label>
              <textarea value={newForm.acceptanceCriteria}
                onChange={(e) => setNewForm({ ...newForm, acceptanceCriteria: e.target.value })}
                rows={6}
                placeholder={"・〇〇できること\n・△△の場合は××する"}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-y min-h-[160px]" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{pt.backlogWorkloadScore} ({pointUnit})</label>
                <input type="number" min={0} step={1} value={newForm.workloadScore}
                  onChange={(e) => setNewForm({ ...newForm, workloadScore: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{pt.rolePO}</label>
                <input type="text" value={newForm.assignedPo}
                  onChange={(e) => setNewForm({ ...newForm, assignedPo: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
              </div>
            </div>
            <p className="text-[11px] text-gray-500">
              作成された PBI は自動的に「Ready」になり、バックログ一覧にも表示されます。
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 flex justify-between items-center gap-3 shrink-0 bg-gray-50/60 rounded-b-2xl">
          <span className="text-sm text-gray-500">
            {tab === "existing" && (<><strong className="text-gray-900">{selected.size}</strong></>)}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
            >
              {t.cancel}
            </button>
            <button
              type="button"
              disabled={tab === "existing" ? (selected.size === 0 || saving) : (saving || (!newForm.userStory.trim() && !newForm.initiative.trim()))}
              onClick={tab === "existing" ? handleSubmit : handleCreateAndAttach}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/>
              </svg>
              {t.sprintAddPbiSubmit}
            </button>
          </div>
        </div>
      </div>

      {detailPbiId && (
        <PbiDetailModal
          projectId={projectId}
          pbiId={detailPbiId}
          onClose={() => setDetailPbiId(null)}
        />
      )}
    </div>
  )
}
