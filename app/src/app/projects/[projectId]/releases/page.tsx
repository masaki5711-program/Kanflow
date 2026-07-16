"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams } from "next/navigation"
import { useLanguage } from "@/lib/language-context"
import { useConfirm } from "@/components/confirm-dialog"
import { HelpTooltip } from "@/components/help-tooltip"

interface PbItem {
  id: string
  displayId: number
  initiative: string | null
  epic: string | null
  userStory: string | null
  workloadScore: number
  status: string
}

interface ReleaseItem {
  id: string
  pbItemId: string | null
  iceboxId: string | null
  initiative: string | null
  epic: string | null
  userStory: string | null
  assignedPo: string | null
  planVersion: string | null
  releaseVersion: string | null
  releaseDate: string | null
  releaseNote: string | null
  manualLink: string | null
  poNote: string | null
  status: string
  pbItem: PbItem | null
}

interface CompletedPbi {
  id: string
  displayId: number
  initiative: string | null
  epic: string | null
  userStory: string | null
  workloadScore: number
}

export default function ReleasesPage() {
  const params = useParams()
  const projectId = params.projectId as string
  const { t, pt } = useLanguage()
  const confirm = useConfirm()

  const [items, setItems] = useState<ReleaseItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showImport, setShowImport] = useState(false)
  const [completedPbis, setCompletedPbis] = useState<CompletedPbi[]>([])
  const [selectedPbIds, setSelectedPbIds] = useState<Set<string>>(new Set())
  const [importVersion, setImportVersion] = useState("")
  const [importing, setImporting] = useState(false)
  const [editingItem, setEditingItem] = useState<ReleaseItem | null>(null)
  const [showReleased, setShowReleased] = useState(false)
  const [collapsedVersions, setCollapsedVersions] = useState<Set<string>>(new Set())

  const fetchItems = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/releases`)
    if (res.ok) setItems(await res.json())
    setLoading(false)
  }, [projectId])

  useEffect(() => { fetchItems() }, [fetchItems])

  const statusColors: Record<string, string> = {
    staged: "bg-gray-100 text-gray-700",
    ready: "bg-blue-100 text-blue-700",
    released: "bg-green-100 text-green-700",
    deferred: "bg-yellow-100 text-yellow-700",
  }

  const statusLabel = (s: string) => {
    const map: Record<string, string> = {
      staged: pt.releaseStatusStaged,
      ready: pt.releaseStatusReady,
      released: pt.releaseStatusReleased,
      deferred: pt.releaseStatusDeferred,
    }
    return map[s] ?? s
  }

  // Group by planVersion
  const activeItems = items.filter((i) => i.status !== "released")
  const releasedItems = items.filter((i) => i.status === "released")

  const groupByVersion = (list: ReleaseItem[]) => {
    const groups = new Map<string, ReleaseItem[]>()
    for (const item of list) {
      const key = item.planVersion ?? "__uncategorized__"
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(item)
    }
    return groups
  }

  const activeGroups = groupByVersion(activeItems)
  const releasedGroups = groupByVersion(releasedItems)

  // Import dialog
  async function openImportDialog() {
    const res = await fetch(`/api/projects/${projectId}/backlog`)
    if (res.ok) {
      const data = await res.json()
      const completed = data.completedItems ?? []
      // Filter out PBIs that already have release items
      const existingPbIds = new Set(items.map((ri) => ri.pbItemId).filter(Boolean))
      setCompletedPbis(completed.filter((p: CompletedPbi) => !existingPbIds.has(p.id)))
    }
    setSelectedPbIds(new Set())
    setImportVersion("")
    setShowImport(true)
  }

  async function handleImport() {
    if (selectedPbIds.size === 0) return
    setImporting(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/releases/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pbItemIds: Array.from(selectedPbIds),
          planVersion: importVersion || undefined,
        }),
      })
      if (res.ok) {
        setShowImport(false)
        fetchItems()
      }
    } finally {
      setImporting(false)
    }
  }

  function togglePbSelection(id: string) {
    setSelectedPbIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Edit item
  async function handleSaveEdit() {
    if (!editingItem) return
    const res = await fetch(`/api/projects/${projectId}/releases/${editingItem.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        initiative: editingItem.initiative,
        epic: editingItem.epic,
        planVersion: editingItem.planVersion,
        releaseVersion: editingItem.releaseVersion,
        releaseDate: editingItem.releaseDate,
        releaseNote: editingItem.releaseNote,
        manualLink: editingItem.manualLink,
        poNote: editingItem.poNote,
        assignedPo: editingItem.assignedPo,
        status: editingItem.status,
      }),
    })
    if (res.ok) {
      setEditingItem(null)
      fetchItems()
    }
  }

  async function handleDelete(id: string) {
    if (!await confirm({ message: t.releaseDeleteConfirm, confirmLabel: t.delete, cancelLabel: t.cancel, variant: "danger" })) return
    const res = await fetch(`/api/projects/${projectId}/releases/${id}`, { method: "DELETE" })
    if (res.ok) {
      setEditingItem(null)
      fetchItems()
    } else {
      alert(t.releaseDeleteFailed)
    }
  }

  async function handleBulkRelease(version: string) {
    const versionItems = items.filter((i) => (i.planVersion ?? "__uncategorized__") === version && i.status !== "released")
    if (versionItems.length === 0) return
    if (!await confirm({ message: `${versionItems.length} ${t.releaseBulkConfirm}`, confirmLabel: t.confirm, cancelLabel: t.cancel, variant: "warning" })) return

    const results = await Promise.allSettled(
      versionItems.map((item) =>
        fetch(`/api/projects/${projectId}/releases/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "released", releaseDate: new Date().toISOString() }),
        }).then((r) => { if (!r.ok) throw new Error(`Failed: ${item.id}`) })
      )
    )
    const failed = results.filter((r) => r.status === "rejected").length
    if (failed > 0) {
      alert(`${failed} ${t.releaseUpdateFailed}`)
    }
    fetchItems()
  }

  function toggleVersionCollapse(version: string) {
    setCollapsedVersions((prev) => {
      const next = new Set(prev)
      if (next.has(version)) next.delete(version)
      else next.add(version)
      return next
    })
  }

  function getItemLabel(item: ReleaseItem) {
    if (item.pbItem) {
      return `#${item.pbItem.displayId} ${item.pbItem.userStory ?? item.epic ?? item.initiative ?? ""}`
    }
    return item.userStory ?? item.epic ?? item.initiative ?? t.sprintNotEntered
  }

  function renderVersionGroup(version: string, groupItems: ReleaseItem[], isReleased: boolean) {
    const label = version === "__uncategorized__" ? pt.releaseUncategorized : version
    const isCollapsed = collapsedVersions.has(version)

    return (
      <div key={version} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 bg-gray-50/80 border-b border-gray-100">
          <button
            onClick={() => toggleVersionCollapse(version)}
            className="flex items-center gap-2 text-left"
          >
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${isCollapsed ? "" : "rotate-90"}`}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd"/>
            </svg>
            <span className="text-sm font-semibold text-gray-700">{label}</span>
            <span className="text-xs text-gray-400">({groupItems.length})</span>
          </button>
          {!isReleased && (
            <button
              onClick={() => handleBulkRelease(version)}
              className="text-xs px-2.5 py-1 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 font-medium transition-colors"
            >
              {pt.releaseBulkRelease}
            </button>
          )}
        </div>
        {!isCollapsed && (
          <div className="divide-y divide-gray-50">
            {groupItems.map((item) => (
              <div
                key={item.id}
                onClick={() => setEditingItem({ ...item })}
                className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <span className={`text-xs px-2 py-0.5 rounded-md font-medium whitespace-nowrap ${statusColors[item.status] ?? "bg-gray-100 text-gray-600"}`}>
                  {statusLabel(item.status)}
                </span>
                {item.pbItem && (
                  <span className="text-xs text-gray-400 font-mono shrink-0">#{item.pbItem.displayId}</span>
                )}
                <span className="text-sm text-gray-800 truncate flex-1">
                  {getItemLabel(item)}
                </span>
                {item.epic && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 shrink-0">
                    {item.epic}
                  </span>
                )}
                {item.releaseDate && (
                  <span className="text-xs text-gray-400 shrink-0">
                    {new Date(item.releaseDate).toLocaleDateString()}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return <div className="text-center py-16 text-gray-500">Loading...</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{pt.releaseTitle}</h1>
        <button
          onClick={openImportDialog}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 text-sm font-medium shadow-sm shadow-blue-500/25 hover:shadow-md transition-all"
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/>
          </svg>
          {pt.releaseImportTitle}
        </button>
      </div>

      {/* Active groups */}
      <div className="space-y-4">
        {activeGroups.size === 0 && releasedGroups.size === 0 && (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gray-100 mb-4">
              <svg className="w-8 h-8 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clipRule="evenodd"/>
              </svg>
            </div>
            <p className="text-lg font-medium text-gray-700 mb-1">{t.releaseNoItems}</p>
            <p className="text-sm text-gray-500">{t.releaseNoItemsDesc}</p>
          </div>
        )}
        {Array.from(activeGroups.entries()).map(([version, groupItems]) =>
          renderVersionGroup(version, groupItems, false)
        )}
      </div>

      {/* Released section */}
      {releasedItems.length > 0 && (
        <div className="mt-8 pt-6 border-t border-gray-200">
          <button
            onClick={() => setShowReleased(!showReleased)}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg
              className={`w-4 h-4 transition-transform ${showReleased ? "rotate-90" : ""}`}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd"/>
            </svg>
            {pt.releaseReleasedSection} ({releasedItems.length})
          </button>
          {showReleased && (
            <div className="space-y-4 mt-4">
              {Array.from(releasedGroups.entries()).map(([version, groupItems]) =>
                renderVersionGroup(version, groupItems, true)
              )}
            </div>
          )}
        </div>
      )}

      {/* Import dialog */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">{pt.releaseImportTitle}</h2>
            </div>
            <div className="px-6 py-4 flex-1 overflow-y-auto space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{pt.releaseVersion}</label>
                <input
                  type="text"
                  value={importVersion}
                  onChange={(e) => setImportVersion(e.target.value)}
                  placeholder="v1.0.0"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
              {completedPbis.length === 0 ? (
                <p className="text-sm text-gray-500 py-4 text-center">{t.releaseNoCompletedItems}</p>
              ) : (
                <div className="space-y-1">
                  {completedPbis.map((pb) => (
                    <label
                      key={pb.id}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedPbIds.has(pb.id)}
                        onChange={() => togglePbSelection(pb.id)}
                        className="rounded border-gray-300"
                      />
                      <span className="text-xs text-gray-400 font-mono">#{pb.displayId}</span>
                      <span className="text-sm text-gray-800 flex-1 truncate">
                        {pb.userStory ?? pb.epic ?? pb.initiative ?? ""}
                      </span>
                      <span className="text-xs text-gray-400">{pb.workloadScore}pt</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => setShowImport(false)}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200"
              >
                {t.cancel}
              </button>
              <button
                onClick={handleImport}
                disabled={selectedPbIds.size === 0 || importing}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50"
              >
                {pt.releaseImportButton} ({selectedPbIds.size}{t.items})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit dialog */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">{pt.releaseEditTitle}</h2>
              {editingItem.pbItem && (
                <p className="text-sm text-gray-500 mt-1">PBI #{editingItem.pbItem.displayId}</p>
              )}
            </div>
            <div className="px-6 py-4 flex-1 overflow-y-auto space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{pt.releaseVersion} (Plan)</label>
                  <input
                    type="text"
                    value={editingItem.planVersion ?? ""}
                    onChange={(e) => setEditingItem({ ...editingItem, planVersion: e.target.value || null })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{pt.releaseVersion} (Actual)</label>
                  <input
                    type="text"
                    value={editingItem.releaseVersion ?? ""}
                    onChange={(e) => setEditingItem({ ...editingItem, releaseVersion: e.target.value || null })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{pt.releaseDate}</label>
                  <input
                    type="date"
                    value={editingItem.releaseDate ? editingItem.releaseDate.slice(0, 10) : ""}
                    onChange={(e) => setEditingItem({ ...editingItem, releaseDate: e.target.value || null })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t.sprintStatus}</label>
                  <select
                    value={editingItem.status}
                    onChange={(e) => setEditingItem({ ...editingItem, status: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  >
                    <option value="staged">{pt.releaseStatusStaged}</option>
                    <option value="ready">{pt.releaseStatusReady}</option>
                    <option value="released">{pt.releaseStatusReleased}</option>
                    <option value="deferred">{pt.releaseStatusDeferred}</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">
                    {pt.backlogInitiative}
                    <HelpTooltip content={pt.backlogInitiativeHelp} ariaLabel={pt.backlogInitiative} side="right" />
                  </label>
                  <input
                    type="text"
                    value={editingItem.initiative ?? ""}
                    onChange={(e) => setEditingItem({ ...editingItem, initiative: e.target.value || null })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">
                    {pt.backlogEpic}
                    <HelpTooltip content={pt.backlogEpicHelp} ariaLabel={pt.backlogEpic} side="right" />
                  </label>
                  <input
                    type="text"
                    value={editingItem.epic ?? ""}
                    onChange={(e) => setEditingItem({ ...editingItem, epic: e.target.value || null })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{pt.rolePO}</label>
                <input
                  type="text"
                  value={editingItem.assignedPo ?? ""}
                  onChange={(e) => setEditingItem({ ...editingItem, assignedPo: e.target.value || null })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{pt.releaseNote}</label>
                <textarea
                  value={editingItem.releaseNote ?? ""}
                  onChange={(e) => setEditingItem({ ...editingItem, releaseNote: e.target.value || null })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{pt.releaseManualLink}</label>
                <input
                  type="text"
                  value={editingItem.manualLink ?? ""}
                  onChange={(e) => setEditingItem({ ...editingItem, manualLink: e.target.value || null })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{pt.releasePoNote}</label>
                <textarea
                  value={editingItem.poNote ?? ""}
                  onChange={(e) => setEditingItem({ ...editingItem, poNote: e.target.value || null })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-between">
              <button
                onClick={() => handleDelete(editingItem.id)}
                className="px-4 py-2 text-sm text-red-600 bg-red-50 rounded-xl hover:bg-red-100"
              >
                {t.delete}
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200"
                >
                  {t.cancel}
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="px-4 py-2 text-sm text-white bg-blue-600 rounded-xl hover:bg-blue-700"
                >
                  {t.save}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
