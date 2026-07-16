"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLanguage } from "@/lib/language-context"
import PlanEditModal from "./plan-edit-modal"
import {
  type PlanItem,
  buildFlatTree,
  chartBounds,
  addDays,
  daysBetween,
  startOfUtcDay,
  ZOOM_DAY_WIDTH,
  formatYmd,
  statusBarColor,
  statusBadgeColor,
} from "./lib/plan-utils"

interface Props {
  projectId: string
  canEdit: boolean
}

const ROW_HEIGHT = 36
const HEADER_HEIGHT = 56
const LEFT_PANE_WIDTH = 360

export function PlanContent({ projectId, canEdit }: Props) {
  const { t } = useLanguage()
  const [items, setItems] = useState<PlanItem[]>([])
  const [loading, setLoading] = useState(true)
  const [zoom, setZoom] = useState<"day" | "week" | "month">("week")
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<PlanItem | null>(null)
  const [savedToast, setSavedToast] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Fetch all items
  const fetchItems = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/plan`)
    if (res.ok) {
      const data: PlanItem[] = await res.json()
      setItems(data)
    }
    setLoading(false)
  }, [projectId])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  // Auto-collapse newly fetched leaves stay expanded; we never auto-collapse
  // existing ids on refresh.
  const flatRows = useMemo(() => buildFlatTree(items, collapsed), [items, collapsed])
  const { min: chartMin, max: chartMax } = useMemo(() => chartBounds(items), [items])
  const dayWidth = ZOOM_DAY_WIDTH[zoom]
  const totalDays = Math.max(1, daysBetween(chartMin, chartMax))
  const totalWidth = totalDays * dayWidth

  // For the parent dropdown in the modal — flatten as visible-order with depth
  const parentOptions = useMemo(
    () => buildFlatTree(items, new Set()).map((r) => ({ id: r.item.id, name: r.item.name, depth: r.depth })),
    [items]
  )

  function todayX(): number {
    const today = startOfUtcDay(new Date())
    return Math.max(0, daysBetween(chartMin, today) * dayWidth)
  }

  async function patchItem(id: string, patch: Partial<PlanItem>) {
    const res = await fetch(`/api/projects/${projectId}/plan/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
    if (res.ok) {
      await fetchItems()
      setSavedToast(true)
      setTimeout(() => setSavedToast(false), 1500)
    }
  }

  async function createItem(initial?: Partial<PlanItem>) {
    const today = formatYmd(new Date())
    const end = formatYmd(addDays(new Date(), 7))
    const res = await fetch(`/api/projects/${projectId}/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: initial?.name ?? t.planAddItem,
        plannedStart: initial?.plannedStart ?? today,
        plannedEnd: initial?.plannedEnd ?? end,
        parentId: initial?.parentId ?? null,
        isMilestone: initial?.isMilestone ?? false,
      }),
    })
    if (res.ok) {
      const created: PlanItem = await res.json()
      await fetchItems()
      // Open the freshly created item for editing right away.
      setEditing(created)
    }
  }

  async function deleteItem(id: string) {
    const res = await fetch(`/api/projects/${projectId}/plan/${id}`, { method: "DELETE" })
    if (res.ok) await fetchItems()
  }

  async function moveItem(id: string, direction: "up" | "down") {
    const me = items.find((i) => i.id === id)
    if (!me) return
    const siblings = items
      .filter((i) => i.parentId === me.parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
    const idx = siblings.findIndex((s) => s.id === id)
    if (idx < 0) return
    const swapIdx = direction === "up" ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= siblings.length) return
    const other = siblings[swapIdx]
    await fetch(`/api/projects/${projectId}/plan/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        updates: [
          { id: me.id, parentId: me.parentId, sortOrder: other.sortOrder },
          { id: other.id, parentId: other.parentId, sortOrder: me.sortOrder },
        ],
      }),
    })
    await fetchItems()
  }

  async function indentItem(id: string) {
    const me = items.find((i) => i.id === id)
    if (!me) return
    // New parent = previous sibling at same level
    const siblings = items
      .filter((i) => i.parentId === me.parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
    const idx = siblings.findIndex((s) => s.id === id)
    if (idx <= 0) return
    const newParent = siblings[idx - 1]
    await patchItem(id, { parentId: newParent.id })
  }

  async function outdentItem(id: string) {
    const me = items.find((i) => i.id === id)
    if (!me || !me.parentId) return
    const parent = items.find((i) => i.id === me.parentId)
    if (!parent) return
    await patchItem(id, { parentId: parent.parentId })
  }

  // ─────────────────────────────────────────────
  // Bar drag — native pointer events for move/resize on the timeline.
  // ─────────────────────────────────────────────
  const dragRef = useRef<{
    id: string
    mode: "move" | "resize"
    startX: number
    initialStart: Date
    initialEnd: Date
  } | null>(null)

  function onBarPointerDown(e: React.PointerEvent, item: PlanItem, mode: "move" | "resize") {
    if (!canEdit || item.isMilestone) return
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = {
      id: item.id,
      mode,
      startX: e.clientX,
      initialStart: new Date(item.plannedStart),
      initialEnd: new Date(item.plannedEnd),
    }
  }

  function onBarPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current
    if (!drag) return
    const deltaDays = Math.round((e.clientX - drag.startX) / dayWidth)
    if (deltaDays === 0) return
    const newStart =
      drag.mode === "move" ? addDays(drag.initialStart, deltaDays) : drag.initialStart
    const newEnd = addDays(drag.initialEnd, deltaDays > 0 || drag.mode === "move" ? deltaDays : deltaDays)
    // Optimistic: update local state only — server PATCH happens on pointerup.
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== drag.id) return it
        if (drag.mode === "move") {
          return { ...it, plannedStart: newStart.toISOString(), plannedEnd: newEnd.toISOString() }
        }
        // resize: only change end, never let end < start
        const candidateEnd = addDays(drag.initialEnd, deltaDays)
        if (candidateEnd.getTime() <= drag.initialStart.getTime()) return it
        return { ...it, plannedEnd: candidateEnd.toISOString() }
      })
    )
  }

  async function onBarPointerUp(e: React.PointerEvent) {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    try {
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    const me = items.find((i) => i.id === drag.id)
    if (!me) return
    await patchItem(drag.id, {
      plannedStart: formatYmd(me.plannedStart),
      plannedEnd: formatYmd(me.plannedEnd),
    })
  }

  // ─────────────────────────────────────────────
  // Date header months/weeks/days
  // ─────────────────────────────────────────────
  const dateHeaderCells = useMemo(() => {
    const out: { label: string; start: number; width: number; level: "month" | "sub" }[] = []
    // Top row = months
    let cursor = new Date(chartMin)
    while (cursor.getTime() < chartMax.getTime()) {
      const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
      const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
      const visStart = monthStart.getTime() < chartMin.getTime() ? chartMin : monthStart
      const visEnd = nextMonth.getTime() > chartMax.getTime() ? chartMax : nextMonth
      const startDays = daysBetween(chartMin, visStart)
      const widthDays = daysBetween(visStart, visEnd)
      out.push({
        label: `${cursor.getFullYear()}/${cursor.getMonth() + 1}`,
        start: startDays * dayWidth,
        width: widthDays * dayWidth,
        level: "month",
      })
      cursor = nextMonth
    }
    return out
  }, [chartMin, chartMax, dayWidth])

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex w-8 h-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M2 5a2 2 0 012-2h2a2 2 0 012 2v1h2a2 2 0 012 2v1h2a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm2 0v1h2V5H4zm4 3v1h2V8H8zm4 3v6h2v-6h-2z"/>
            </svg>
          </span>
          <div>
            <h1 className="text-lg font-bold text-gray-900 leading-tight">{t.planTitle}</h1>
            <p className="text-xs text-gray-500">{t.planDesc}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs">
            {(["day", "week", "month"] as const).map((z) => (
              <button
                key={z}
                onClick={() => setZoom(z)}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  zoom === z ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {z === "day" ? t.planZoomDay : z === "week" ? t.planZoomWeek : t.planZoomMonth}
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              const el = scrollRef.current
              if (!el) return
              el.scrollLeft = Math.max(0, todayX() - el.clientWidth / 2)
            }}
            className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            {t.planTodayJump}
          </button>
          {canEdit && (
            <>
              <button
                onClick={() => createItem()}
                className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
              >
                + {t.planAddItem}
              </button>
              <button
                onClick={() => createItem({ isMilestone: true, name: t.planAddMilestone, plannedEnd: formatYmd(new Date()) })}
                className="px-3 py-1.5 text-xs bg-violet-600 text-white rounded-lg hover:bg-violet-700 font-medium"
              >
                ◆ {t.planAddMilestone}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-2.5 rounded bg-gray-300" />{t.planStatusNotStarted}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-2.5 rounded bg-blue-500" />{t.planStatusInProgress}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-2.5 rounded bg-amber-500" />{t.planStatusOnHold}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-2.5 rounded bg-rose-500" />{t.planStatusDelayed}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-2.5 rounded bg-emerald-500" />{t.planStatusDone}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="text-violet-500">◆</span>{t.planIsMilestone}
        </span>
        <span className="inline-flex items-center gap-1.5 ml-2">
          <span className="w-3 h-1.5 rounded bg-gray-200 relative overflow-hidden">
            <span className="absolute inset-y-0 left-0 w-1/2 bg-indigo-400" />
          </span>
          {t.planProgressLegend}
        </span>
      </div>

      {/* Body */}
      {loading ? (
        <div className="text-sm text-gray-400 py-12 text-center">…</div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center">
          <p className="text-sm text-gray-500 mb-3">{t.planEmpty}</p>
          {canEdit && (
            <button
              onClick={() => createItem()}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
            >
              + {t.planAddItem}
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <div className="flex" style={{ minHeight: HEADER_HEIGHT + flatRows.length * ROW_HEIGHT }}>
            {/* Left pane: tree */}
            <div className="shrink-0 border-r border-gray-200" style={{ width: LEFT_PANE_WIDTH }}>
              <div
                className="border-b border-gray-200 bg-gray-50 px-3 flex items-center text-[11px] font-semibold text-gray-500"
                style={{ height: HEADER_HEIGHT }}
              >
                {t.planTitle}
              </div>
              {flatRows.map((row) => (
                <div
                  key={row.item.id}
                  className="border-b border-gray-100 px-2 flex items-center gap-1.5 group hover:bg-gray-50/60"
                  style={{ height: ROW_HEIGHT, paddingLeft: 8 + row.depth * 16 }}
                >
                  {row.hasChildren ? (
                    <button
                      onClick={() => {
                        setCollapsed((prev) => {
                          const next = new Set(prev)
                          if (next.has(row.item.id)) next.delete(row.item.id)
                          else next.add(row.item.id)
                          return next
                        })
                      }}
                      className="w-4 h-4 text-gray-400 hover:text-gray-700 shrink-0"
                    >
                      <svg
                        className={`w-3.5 h-3.5 transition-transform ${collapsed.has(row.item.id) ? "" : "rotate-90"}`}
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd"/>
                      </svg>
                    </button>
                  ) : (
                    <span className="w-4 h-4 shrink-0" />
                  )}
                  {row.item.isMilestone && <span className="text-violet-500 text-xs">◆</span>}
                  <button
                    onClick={() => setEditing(row.item)}
                    className="flex-1 text-left text-xs text-gray-800 truncate hover:text-indigo-600"
                    title={row.item.name}
                  >
                    {row.item.name}
                  </button>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0 ${statusBadgeColor(row.item.status)}`}>
                    {row.item.progressPct}%
                  </span>
                  {canEdit && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => moveItem(row.item.id, "up")}
                        className="w-5 h-5 text-gray-400 hover:text-gray-700 text-xs"
                        title="↑"
                      >↑</button>
                      <button
                        onClick={() => moveItem(row.item.id, "down")}
                        className="w-5 h-5 text-gray-400 hover:text-gray-700 text-xs"
                        title="↓"
                      >↓</button>
                      <button
                        onClick={() => outdentItem(row.item.id)}
                        className="w-5 h-5 text-gray-400 hover:text-gray-700 text-xs"
                        title={t.planOutdent}
                      >◀</button>
                      <button
                        onClick={() => indentItem(row.item.id)}
                        className="w-5 h-5 text-gray-400 hover:text-gray-700 text-xs"
                        title={t.planIndent}
                      >▶</button>
                      <button
                        onClick={() => createItem({ parentId: row.item.id })}
                        className="w-5 h-5 text-indigo-500 hover:text-indigo-700 text-xs"
                        title={t.planAddChild}
                      >+</button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Right pane: timeline */}
            <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-hidden">
              <div className="relative" style={{ width: totalWidth, minWidth: "100%" }}>
                {/* Date header */}
                <div
                  className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200"
                  style={{ height: HEADER_HEIGHT }}
                >
                  {dateHeaderCells.map((c, i) => (
                    <div
                      key={i}
                      className="absolute top-0 h-full text-[11px] text-gray-500 px-2 py-2 border-r border-gray-200 flex items-end"
                      style={{ left: c.start, width: c.width }}
                    >
                      {c.label}
                    </div>
                  ))}
                  {/* Day grid lines on top of month bands */}
                </div>

                {/* Body rows */}
                <div className="relative">
                  {flatRows.map((row, rowIdx) => {
                    const startDays = Math.max(0, daysBetween(chartMin, new Date(row.item.plannedStart)))
                    const endDays = Math.max(startDays + 1, daysBetween(chartMin, new Date(row.item.plannedEnd)))
                    const barLeft = startDays * dayWidth
                    const barWidth = Math.max(dayWidth * 0.5, (endDays - startDays) * dayWidth)
                    const actualLeft = row.item.actualStart
                      ? daysBetween(chartMin, new Date(row.item.actualStart)) * dayWidth
                      : null
                    const actualEnd = row.item.actualEnd
                      ? daysBetween(chartMin, new Date(row.item.actualEnd)) * dayWidth
                      : null
                    return (
                      <div
                        key={row.item.id}
                        className="relative border-b border-gray-100"
                        style={{ height: ROW_HEIGHT }}
                      >
                        {row.item.isMilestone ? (
                          <div
                            onClick={() => setEditing(row.item)}
                            className="absolute top-1/2 -translate-y-1/2 cursor-pointer"
                            style={{ left: barLeft + Math.min(8, dayWidth / 2) - 8 }}
                            title={row.item.name}
                          >
                            <span className="block w-4 h-4 bg-violet-500 rotate-45 shadow-md" />
                          </div>
                        ) : (
                          <>
                            {/* Planned bar */}
                            <div
                              className={`absolute top-1/2 -translate-y-1/2 rounded-md shadow-sm overflow-hidden ${statusBarColor(row.item.status)} ${canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
                              style={{
                                left: barLeft,
                                width: barWidth,
                                height: 18,
                                opacity: row.item.status === "not_started" ? 0.7 : 1,
                              }}
                              onPointerDown={(e) => onBarPointerDown(e, row.item, "move")}
                              onPointerMove={onBarPointerMove}
                              onPointerUp={onBarPointerUp}
                              onPointerCancel={onBarPointerUp}
                              onDoubleClick={() => setEditing(row.item)}
                              title={`${row.item.name} (${row.item.progressPct}%)`}
                            >
                              {/* Progress overlay */}
                              <div
                                className="absolute inset-y-0 left-0 bg-white/35"
                                style={{ width: `${row.item.progressPct}%` }}
                              />
                              <span className="absolute inset-0 flex items-center justify-center text-[10px] text-white font-medium px-1 truncate pointer-events-none">
                                {row.item.name}
                              </span>
                              {/* Right resize handle */}
                              {canEdit && (
                                <div
                                  className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize bg-black/10 hover:bg-black/30"
                                  onPointerDown={(e) => onBarPointerDown(e, row.item, "resize")}
                                  onPointerMove={onBarPointerMove}
                                  onPointerUp={onBarPointerUp}
                                  onPointerCancel={onBarPointerUp}
                                />
                              )}
                            </div>
                            {/* Actual bar (below planned) */}
                            {actualLeft !== null && actualEnd !== null && actualEnd > actualLeft && (
                              <div
                                className="absolute rounded bg-gray-700/60"
                                style={{
                                  left: actualLeft,
                                  width: Math.max(2, actualEnd - actualLeft),
                                  top: ROW_HEIGHT - 8,
                                  height: 4,
                                }}
                                title={`実績: ${formatYmd(row.item.actualStart!)} ~ ${formatYmd(row.item.actualEnd!)}`}
                              />
                            )}
                          </>
                        )}
                        {/* Hover row tint */}
                        {rowIdx === flatRows.length - 1 && <span />}
                      </div>
                    )
                  })}

                  {/* Today line */}
                  <div
                    className="absolute top-0 bottom-0 w-px bg-red-400/70 pointer-events-none"
                    style={{ left: todayX() }}
                  >
                    <span className="absolute top-0 -translate-x-1/2 text-[9px] text-red-500 bg-white px-1 rounded">
                      ●
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Saved toast */}
      {savedToast && (
        <div className="fixed bottom-6 right-6 bg-gray-900 text-white text-xs px-3 py-2 rounded-lg shadow-lg z-50">
          {t.planSavedJustNow}
        </div>
      )}

      <PlanEditModal
        open={editing !== null}
        initial={editing}
        parentOptions={parentOptions}
        onClose={() => setEditing(null)}
        onSave={async (patch) => {
          if (!editing) return
          await patchItem(editing.id, patch)
          setEditing(null)
        }}
        onDelete={canEdit && editing ? async () => {
          if (!editing) return
          await deleteItem(editing.id)
          setEditing(null)
        } : undefined}
      />
    </div>
  )
}
