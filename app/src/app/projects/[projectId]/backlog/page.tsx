"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams } from "next/navigation"
import { useLanguage } from "@/lib/language-context"

interface ProductGoal {
  id: string
  title: string
  description: string | null
}

interface IceboxItem {
  id: string
  displayId: number
  request: string
  background: string | null
  author: string
  status: string
}

interface BacklogItem {
  id: string
  displayId: number
  initiative: string | null
  epic: string | null
  userStory: string | null
  acceptanceCriteria: string | null
  workloadScore: number
  status: string
  assignedPo: string | null
  sortOrder: number
  completedAt: string | null
  iceboxItemId: string | null
  iceboxItem: { id: string; request: string } | null
  productGoalId: string | null
  productGoal: { id: string; title: string } | null
}

// User story format helpers
const US_WHO_PREFIX = "＜誰が＞"
const US_WHAT_PREFIX = "＜何を＞"
const US_WHY_PREFIX = "＜なぜ＞"

function buildUserStory(who: string, what: string, why: string): string {
  const parts: string[] = []
  if (who) parts.push(`${US_WHO_PREFIX} ${who}として、`)
  if (what) parts.push(`${US_WHAT_PREFIX} ${what}したい。`)
  if (why) parts.push(`${US_WHY_PREFIX} それは${why}だからだ。`)
  return parts.join("\n")
}

function parseUserStory(story: string | null): { who: string; what: string; why: string } {
  if (!story) return { who: "", what: "", why: "" }

  let who = ""
  let what = ""
  let why = ""

  const whoMatch = story.match(/＜誰が＞\s*(.+?)として、/)
  if (whoMatch) who = whoMatch[1].trim()

  const whatMatch = story.match(/＜何を＞\s*(.+?)したい。/)
  if (whatMatch) what = whatMatch[1].trim()

  const whyMatch = story.match(/＜なぜ＞\s*それは(.+?)だからだ。/)
  if (whyMatch) why = whyMatch[1].trim()

  // If no structured format found, put entire text in "what"
  if (!who && !what && !why && story.trim()) {
    what = story.trim()
  }

  return { who, what, why }
}

export default function BacklogPage() {
  const params = useParams()
  const projectId = params.projectId as string
  const { t, pt } = useLanguage()

  const [readyItems, setReadyItems] = useState<BacklogItem[]>([])
  const [notReadyItems, setNotReadyItems] = useState<BacklogItem[]>([])
  const [completedItems, setCompletedItems] = useState<BacklogItem[]>([])
  const [totalWorkload, setTotalWorkload] = useState(0)
  const [initialLoading, setInitialLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [iceboxItems, setIceboxItems] = useState<IceboxItem[]>([])
  const [productGoals, setProductGoals] = useState<ProductGoal[]>([])
  const [showCompleted, setShowCompleted] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  const [form, setForm] = useState({
    initiative: "",
    epic: "",
    storyWho: "",
    storyWhat: "",
    storyWhy: "",
    acceptanceCriteria: "",
    workloadScore: 0,
    status: "not_ready" as "ready" | "not_ready" | "completed",
    iceboxItemId: "" as string,
    productGoalId: "" as string,
  })

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/backlog`)
      if (res.ok) {
        const data = await res.json()
        setReadyItems(data.readyItems)
        setNotReadyItems(data.notReadyItems)
        setCompletedItems(data.completedItems ?? [])
        setTotalWorkload(data.totalWorkload)
      }
    } finally {
      setInitialLoading(false)
    }
  }, [projectId])

  const fetchIceboxItems = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/icebox`)
    if (res.ok) {
      const data = await res.json()
      setIceboxItems([...data.unreviewed, ...data.reviewed])
    }
  }, [projectId])

  const fetchProductGoals = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/goals`)
    if (res.ok) {
      const data = await res.json()
      setProductGoals(data)
    }
  }, [projectId])

  useEffect(() => {
    fetchItems()
    fetchIceboxItems()
    fetchProductGoals()
  }, [fetchItems, fetchIceboxItems, fetchProductGoals])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const url = editingId
      ? `/api/projects/${projectId}/backlog/${editingId}`
      : `/api/projects/${projectId}/backlog`
    const method = editingId ? "PATCH" : "POST"

    const userStory = buildUserStory(form.storyWho, form.storyWhat, form.storyWhy)

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initiative: form.initiative || undefined,
          epic: form.epic || undefined,
          userStory: userStory || undefined,
          acceptanceCriteria: form.acceptanceCriteria || undefined,
          workloadScore: form.workloadScore,
          status: form.status,
          iceboxItemId: form.iceboxItemId || undefined,
          productGoalId: form.productGoalId || null,
        }),
      })
      if (res.ok) {
        resetForm()
        fetchItems()
      } else {
        const err = await res.json().catch(() => null)
        alert(`${t.error}: ${err?.error || res.statusText}`)
      }
    } catch {
      alert(t.error)
    }
  }

  function resetForm() {
    setShowForm(false)
    setEditingId(null)
    setForm({
      initiative: "",
      epic: "",
      storyWho: "",
      storyWhat: "",
      storyWhy: "",
      acceptanceCriteria: "",
      workloadScore: 0,
      status: "not_ready",
      iceboxItemId: "",
      productGoalId: "",
    })
  }

  function startEdit(item: BacklogItem) {
    const parsed = parseUserStory(item.userStory)
    setEditingId(item.id)
    setForm({
      initiative: item.initiative ?? "",
      epic: item.epic ?? "",
      storyWho: parsed.who,
      storyWhat: parsed.what,
      storyWhy: parsed.why,
      acceptanceCriteria: item.acceptanceCriteria ?? "",
      workloadScore: item.workloadScore,
      status: item.status as "ready" | "not_ready" | "completed",
      iceboxItemId: item.iceboxItemId ?? "",
      productGoalId: item.productGoalId ?? "",
    })
    setShowForm(true)
  }

  function handleSelectIcebox(iceboxId: string) {
    const icebox = iceboxItems.find((i) => i.id === iceboxId)
    if (icebox) {
      setForm((prev) => ({
        ...prev,
        iceboxItemId: iceboxId,
        storyWhat: prev.storyWhat || icebox.request,
      }))
    } else {
      setForm((prev) => ({ ...prev, iceboxItemId: "" }))
    }
  }

  async function handleDelete(itemId: string) {
    if (!confirm(t.iceboxDeleteConfirm)) return
    try {
      const res = await fetch(
        `/api/projects/${projectId}/backlog/${itemId}`,
        { method: "DELETE" }
      )
      if (res.ok) fetchItems()
      else alert(`${t.error}: ${res.statusText}`)
    } catch {
      alert(t.error)
    }
  }

  async function handleStatusChange(itemId: string, newStatus: string) {
    const res = await fetch(`/api/projects/${projectId}/backlog/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    })
    if (res.ok) fetchItems()
  }

  async function moveUp(items: BacklogItem[], index: number) {
    if (index === 0) return
    const newItems = [...items]
    const temp = newItems[index]
    newItems[index] = newItems[index - 1]
    newItems[index - 1] = temp

    const orderedIds = newItems.map((i) => i.id)
    await fetch(`/api/projects/${projectId}/backlog/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds }),
    })
    fetchItems()
  }

  async function moveDown(items: BacklogItem[], index: number) {
    if (index === items.length - 1) return
    const newItems = [...items]
    const temp = newItems[index]
    newItems[index] = newItems[index + 1]
    newItems[index + 1] = temp

    const orderedIds = newItems.map((i) => i.id)
    await fetch(`/api/projects/${projectId}/backlog/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds }),
    })
    fetchItems()
  }

  function renderUserStory(story: string | null) {
    if (!story) return <span className="text-gray-400">{t.sprintNotEntered}</span>
    const parsed = parseUserStory(story)
    if (!parsed.who && !parsed.what && !parsed.why) {
      return <span>{story}</span>
    }
    return (
      <div className="text-xs leading-relaxed">
        {parsed.who && (
          <div><span className="text-blue-600 font-medium">{pt.backlogWho}:</span> {parsed.who}</div>
        )}
        {parsed.what && (
          <div><span className="text-green-600 font-medium">{pt.backlogWhat}:</span> {parsed.what}</div>
        )}
        {parsed.why && (
          <div><span className="text-orange-600 font-medium">{pt.backlogWhy}:</span> {parsed.why}</div>
        )}
      </div>
    )
  }

  function renderItemList(
    title: string,
    items: BacklogItem[],
    showWorkloadTotal: boolean,
    sectionStatus: "ready" | "not_ready" | "completed"
  ) {
    const sectionWorkload = items.reduce((sum, i) => sum + i.workloadScore, 0)

    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            {title}
            <span className="text-sm font-normal text-gray-500 ml-2">({items.length}{t.items})</span>
          </h2>
          {showWorkloadTotal && (
            <span className="text-sm font-medium bg-blue-100 text-blue-800 px-3 py-1 rounded-full">
              {t.reportTotalWorkload}: {sectionWorkload}
            </span>
          )}
        </div>

        <div className="space-y-2">
          {items.map((item, index) => (
            <div
              key={item.id}
              className={`flex items-start gap-3 border border-gray-100 rounded-md p-3 hover:bg-gray-50 ${
                sectionStatus === "completed" ? "opacity-70" : ""
              }`}
            >
              {sectionStatus !== "completed" && (
                <div className="flex flex-col gap-1 pt-1">
                  <button
                    onClick={() => moveUp(items, index)}
                    disabled={index === 0}
                    className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => moveDown(items, index)}
                    disabled={index === items.length - 1}
                    className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30"
                  >
                    ▼
                  </button>
                </div>
              )}

              <span className="text-xs font-mono text-gray-400 w-8 pt-1">#{item.displayId}</span>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  {item.initiative || `${t.sprintNotEntered}`}
                </p>
                <div className="flex items-center gap-2 mb-1">
                  {item.epic && <span className="text-xs text-gray-500">{pt.backlogEpic}: {item.epic}</span>}
                  {item.productGoal && (
                    <span className="text-xs text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                      {t.dashboardGoal}: {item.productGoal.title}
                    </span>
                  )}
                  {item.iceboxItem && (
                    <span className="text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
                      {pt.navIcebox}: {item.iceboxItem.request.slice(0, 30)}
                      {item.iceboxItem.request.length > 30 ? "..." : ""}
                    </span>
                  )}
                </div>
                {renderUserStory(item.userStory)}
                {sectionStatus === "completed" && item.completedAt && (
                  <span className="text-xs text-green-600 mt-1 inline-block">
                    {t.backlogCompletedDate}: {new Date(item.completedAt).toLocaleDateString()}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs font-medium bg-orange-100 text-orange-800 px-2 py-1 rounded flex-shrink-0">
                {pt.backlogWorkloadScore}: {item.workloadScore}
              </div>

              <div className="flex gap-1 flex-shrink-0">
                {sectionStatus === "ready" && (
                  <button
                    onClick={() => handleStatusChange(item.id, "completed")}
                    className="text-xs text-green-600 hover:text-green-800 px-2 py-1"
                  >
                    {t.backlogMoveToCompleted}
                  </button>
                )}
                {sectionStatus === "completed" && (
                  <button
                    onClick={() => handleStatusChange(item.id, "ready")}
                    className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1"
                  >
                    {t.backlogMoveToReady}
                  </button>
                )}
                {sectionStatus !== "completed" && (
                  <>
                    <button onClick={() => startEdit(item)} className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1">
                      {t.edit}
                    </button>
                    <button onClick={() => handleDelete(item.id)} className="text-xs text-red-500 hover:text-red-700 px-2 py-1">
                      {t.delete}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">{t.iceboxNoItems}</p>
          )}
        </div>
      </div>
    )
  }

  if (initialLoading) {
    return (
      <div className="text-center py-16 text-gray-500">{t.loading}</div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{pt.backlogTitle}</h1>
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
        >
          {t.backlogAddItem}
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-medium mb-4">
            {editingId ? t.edit : t.backlogAddItem}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* IceBox selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {pt.navIcebox} ({pt.iceboxRequest})
              </label>
              <select
                value={form.iceboxItemId}
                onChange={(e) => handleSelectIcebox(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- {t.cancel} --</option>
                {iceboxItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    #{item.displayId} - {item.request.slice(0, 60)}{item.request.length > 60 ? "..." : ""} ({item.author})
                  </option>
                ))}
              </select>
            </div>

            {/* Product Goal selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.dashboardProductGoals}
              </label>
              <select
                value={form.productGoalId}
                onChange={(e) => setForm({ ...form, productGoalId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- {t.eventNone} --</option>
                {productGoals.map((goal) => (
                  <option key={goal.id} value={goal.id}>
                    {goal.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {pt.backlogInitiative}
                </label>
                <input
                  type="text"
                  value={form.initiative}
                  onChange={(e) => setForm({ ...form, initiative: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{pt.backlogEpic}</label>
                <input
                  type="text"
                  value={form.epic}
                  onChange={(e) => setForm({ ...form, epic: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* User Story - structured 3 fields */}
            <div className="border border-blue-200 rounded-lg p-4 bg-blue-50/30">
              <label className="block text-sm font-semibold text-gray-800 mb-3">
                {pt.backlogUserStory}
              </label>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-blue-700 mb-1">
                    ＜{pt.backlogWho}＞（ユーザーの役割）： 〜として、
                  </label>
                  <input
                    type="text"
                    value={form.storyWho}
                    onChange={(e) => setForm({ ...form, storyWho: e.target.value })}
                    placeholder="例: プロジェクトマネージャー"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-green-700 mb-1">
                    ＜{pt.backlogWhat}＞（達成したい機能）： 〜したい。
                  </label>
                  <textarea
                    value={form.storyWhat}
                    onChange={(e) => setForm({ ...form, storyWhat: e.target.value })}
                    placeholder="例: チームの進捗をリアルタイムで確認"
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-orange-700 mb-1">
                    ＜{pt.backlogWhy}＞（得られる価値）： それは〜だからだ。
                  </label>
                  <textarea
                    value={form.storyWhy}
                    onChange={(e) => setForm({ ...form, storyWhy: e.target.value })}
                    placeholder="例: 遅延リスクを早期に発見できる"
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              {/* Preview */}
              {(form.storyWho || form.storyWhat || form.storyWhy) && (
                <div className="mt-3 pt-3 border-t border-blue-200 text-xs text-gray-600">
                  {form.storyWho && <span>{form.storyWho}として、</span>}
                  {form.storyWhat && <span>{form.storyWhat}したい。</span>}
                  {form.storyWhy && <span>それは{form.storyWhy}だからだ。</span>}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {pt.backlogAcceptanceCriteria}
              </label>
              <textarea
                value={form.acceptanceCriteria}
                onChange={(e) => setForm({ ...form, acceptanceCriteria: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{pt.backlogWorkloadScore}</label>
                <input
                  type="number"
                  min={0}
                  value={form.workloadScore}
                  onChange={(e) => setForm({ ...form, workloadScore: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t.iceboxStatus}
                </label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as "ready" | "not_ready" | "completed" })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                  <option value="not_ready">{t.backlogStatusNotReady}</option>
                  <option value="ready">{t.backlogStatusReady}</option>
                  <option value="completed">{t.backlogStatusCompleted}</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm">
                {editingId ? t.update : t.add}
              </button>
              <button type="button" onClick={resetForm} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 text-sm">
                {t.cancel}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Search filter */}
      <div className="mb-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={`🔍 ${pt.backlogInitiative} / ${pt.backlogEpic} / ${pt.backlogUserStory}`}
          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-gray-400"
        />
      </div>

      <div className="space-y-6">
        {(() => {
          const q = searchQuery.toLowerCase().trim()
          const filterItems = (list: BacklogItem[]) =>
            q
              ? list.filter(
                  (item) =>
                    (item.initiative ?? "").toLowerCase().includes(q) ||
                    (item.epic ?? "").toLowerCase().includes(q) ||
                    (item.userStory ?? "").toLowerCase().includes(q) ||
                    (item.acceptanceCriteria ?? "").toLowerCase().includes(q) ||
                    String(item.displayId).includes(q)
                )
              : list
          const filteredReady = filterItems(readyItems)
          const filteredNotReady = filterItems(notReadyItems)
          const filteredCompleted = filterItems(completedItems)
          return (
            <>
              {renderItemList(`Ready (${t.backlogStatusReady})`, filteredReady, true, "ready")}
              {renderItemList(`Not Ready (${t.backlogStatusNotReady})`, filteredNotReady, false, "not_ready")}

              {/* Completed section - collapsible */}
              <div>
                <button
                  onClick={() => setShowCompleted(!showCompleted)}
                  className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-2"
                >
                  <span>{showCompleted ? "▼" : "▶"}</span>
                  {showCompleted ? t.backlogHideCompleted : t.backlogShowCompleted}
                  <span className="text-xs text-gray-400">({filteredCompleted.length}{t.items})</span>
                </button>
                {showCompleted && renderItemList(t.backlogStatusCompleted, filteredCompleted, false, "completed")}
              </div>
            </>
          )
        })()}
      </div>
    </div>
  )
}
