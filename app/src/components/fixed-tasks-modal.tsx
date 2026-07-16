"use client"

import { useEffect, useState } from "react"
import { useLanguage } from "@/lib/language-context"

export interface FixedTaskItem {
  id: string
  taskName: string
  sortOrder: number
}

export interface FixedTaskGroup {
  id: string
  taskName: string
  sortOrder: number
  items: FixedTaskItem[]
}

interface Props {
  open: boolean
  onClose: () => void
}

export default function FixedTasksModal({ open, onClose }: Props) {
  const { t } = useLanguage()
  const [groups, setGroups] = useState<FixedTaskGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [newGroupName, setNewGroupName] = useState("")
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editingGroupName, setEditingGroupName] = useState("")
  const [newItemNameByGroup, setNewItemNameByGroup] = useState<Record<string, string>>({})
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingItemName, setEditingItemName] = useState("")

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch("/api/user/fixed-tasks")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data: FixedTaskGroup[]) => setGroups(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open])

  async function handleAddGroup(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = newGroupName.trim()
    if (!trimmed) return
    const res = await fetch("/api/user/fixed-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskName: trimmed }),
    })
    if (res.ok) {
      const created: FixedTaskGroup = await res.json()
      setGroups((prev) => [...prev, { ...created, items: created.items ?? [] }])
      setNewGroupName("")
      setExpandedGroupId(created.id)
    }
  }

  async function handleSaveGroupEdit(id: string) {
    const trimmed = editingGroupName.trim()
    if (!trimmed) {
      setEditingGroupId(null)
      return
    }
    const res = await fetch(`/api/user/fixed-tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskName: trimmed }),
    })
    if (res.ok) {
      const updated = await res.json()
      setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, taskName: updated.taskName } : g)))
      setEditingGroupId(null)
    }
  }

  async function handleDeleteGroup(id: string) {
    const res = await fetch(`/api/user/fixed-tasks/${id}`, { method: "DELETE" })
    if (res.ok) setGroups((prev) => prev.filter((g) => g.id !== id))
  }

  async function handleAddItem(groupId: string) {
    const trimmed = (newItemNameByGroup[groupId] ?? "").trim()
    if (!trimmed) return
    const res = await fetch(`/api/user/fixed-tasks/${groupId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskName: trimmed }),
    })
    if (res.ok) {
      const created: FixedTaskItem = await res.json()
      setGroups((prev) =>
        prev.map((g) => (g.id === groupId ? { ...g, items: [...g.items, created] } : g))
      )
      setNewItemNameByGroup((prev) => ({ ...prev, [groupId]: "" }))
    }
  }

  async function handleSaveItemEdit(groupId: string, itemId: string) {
    const trimmed = editingItemName.trim()
    if (!trimmed) {
      setEditingItemId(null)
      return
    }
    const res = await fetch(`/api/user/fixed-tasks/${groupId}/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskName: trimmed }),
    })
    if (res.ok) {
      const updated: FixedTaskItem = await res.json()
      setGroups((prev) =>
        prev.map((g) =>
          g.id === groupId
            ? { ...g, items: g.items.map((it) => (it.id === itemId ? updated : it)) }
            : g
        )
      )
      setEditingItemId(null)
    }
  }

  async function handleDeleteItem(groupId: string, itemId: string) {
    const res = await fetch(`/api/user/fixed-tasks/${groupId}/items/${itemId}`, {
      method: "DELETE",
    })
    if (res.ok) {
      setGroups((prev) =>
        prev.map((g) => (g.id === groupId ? { ...g, items: g.items.filter((it) => it.id !== itemId) } : g))
      )
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        role="dialog"
        aria-modal="true"
      >
        <div className="px-6 py-4 border-b border-gray-100 shrink-0">
          <h3 className="text-lg font-bold text-gray-900">{t.fixedTasksTitle}</h3>
          <p className="text-xs text-gray-500 mt-1">{t.fixedTasksDesc}</p>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1 space-y-2">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-6">…</p>
          ) : groups.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">{t.fixedTasksEmpty}</p>
          ) : (
            groups.map((group) => {
              const isExpanded = expandedGroupId === group.id
              return (
                <div key={group.id} className="rounded-xl border border-gray-150 bg-gray-50/40 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setExpandedGroupId(isExpanded ? null : group.id)}
                      className="p-0.5 text-gray-400 hover:text-gray-700"
                      title={isExpanded ? "−" : "+"}
                    >
                      <svg
                        className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd"/>
                      </svg>
                    </button>
                    {editingGroupId === group.id ? (
                      <>
                        <input
                          type="text"
                          value={editingGroupName}
                          onChange={(e) => setEditingGroupName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault()
                              handleSaveGroupEdit(group.id)
                            } else if (e.key === "Escape") {
                              setEditingGroupId(null)
                            }
                          }}
                          autoFocus
                          className="flex-1 px-2 py-1 text-sm border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                        />
                        <button
                          onClick={() => handleSaveGroupEdit(group.id)}
                          className="text-xs px-2 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                        >
                          {t.update}
                        </button>
                        <button
                          onClick={() => setEditingGroupId(null)}
                          className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                        >
                          {t.cancel}
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-sm font-semibold text-gray-800 truncate">{group.taskName}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 font-medium">
                          {group.items.length}
                        </span>
                        <button
                          onClick={() => {
                            setEditingGroupId(group.id)
                            setEditingGroupName(group.taskName)
                          }}
                          className="text-xs text-blue-600 hover:text-blue-800 px-2 py-0.5 rounded hover:bg-blue-50"
                        >
                          {t.edit}
                        </button>
                        <button
                          onClick={() => handleDeleteGroup(group.id)}
                          className="text-xs text-red-500 hover:text-red-700 px-2 py-0.5 rounded hover:bg-red-50"
                        >
                          {t.delete}
                        </button>
                      </>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="px-3 pb-3 pl-9 space-y-2 bg-white border-t border-gray-100">
                      {group.items.length === 0 ? (
                        <p className="text-xs text-gray-400 py-2">{t.fixedTasksItemEmpty}</p>
                      ) : (
                        <ul className="space-y-1 pt-2">
                          {group.items.map((item) => (
                            <li
                              key={item.id}
                              className="group/item flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50"
                            >
                              <span className="text-gray-300 text-xs">•</span>
                              {editingItemId === item.id ? (
                                <>
                                  <input
                                    type="text"
                                    value={editingItemName}
                                    onChange={(e) => setEditingItemName(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault()
                                        handleSaveItemEdit(group.id, item.id)
                                      } else if (e.key === "Escape") {
                                        setEditingItemId(null)
                                      }
                                    }}
                                    autoFocus
                                    className="flex-1 px-2 py-0.5 text-sm border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                                  />
                                  <button
                                    onClick={() => handleSaveItemEdit(group.id, item.id)}
                                    className="text-xs px-2 py-0.5 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                                  >
                                    {t.update}
                                  </button>
                                  <button
                                    onClick={() => setEditingItemId(null)}
                                    className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                                  >
                                    {t.cancel}
                                  </button>
                                </>
                              ) : (
                                <>
                                  <span className="flex-1 text-sm text-gray-700 truncate">{item.taskName}</span>
                                  <button
                                    onClick={() => {
                                      setEditingItemId(item.id)
                                      setEditingItemName(item.taskName)
                                    }}
                                    className="opacity-0 group-hover/item:opacity-100 text-xs text-blue-600 hover:text-blue-800 px-1.5 py-0.5 rounded hover:bg-blue-50 transition-all"
                                  >
                                    {t.edit}
                                  </button>
                                  <button
                                    onClick={() => handleDeleteItem(group.id, item.id)}
                                    className="opacity-0 group-hover/item:opacity-100 text-xs text-red-500 hover:text-red-700 px-1.5 py-0.5 rounded hover:bg-red-50 transition-all"
                                  >
                                    {t.delete}
                                  </button>
                                </>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="text"
                          value={newItemNameByGroup[group.id] ?? ""}
                          onChange={(e) =>
                            setNewItemNameByGroup((prev) => ({ ...prev, [group.id]: e.target.value }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault()
                              handleAddItem(group.id)
                            }
                          }}
                          placeholder={t.fixedTasksItemNamePlaceholder}
                          className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddItem(group.id)}
                          disabled={!(newItemNameByGroup[group.id] ?? "").trim()}
                          className="text-xs px-3 py-1 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium disabled:bg-indigo-300 disabled:cursor-not-allowed"
                        >
                          {t.fixedTasksAdd}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        <form
          onSubmit={handleAddGroup}
          className="px-6 py-3 border-t border-gray-100 shrink-0 flex items-center gap-2"
        >
          <input
            type="text"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder={t.fixedTasksGroupNamePlaceholder}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={!newGroupName.trim()}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium disabled:bg-indigo-300 disabled:cursor-not-allowed"
          >
            {t.fixedTasksAdd}
          </button>
        </form>

        <div className="px-6 py-3 border-t border-gray-100 shrink-0 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium"
          >
            {t.close}
          </button>
        </div>
      </div>
    </div>
  )
}
