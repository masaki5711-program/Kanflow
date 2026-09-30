"use client"

import { useMemo, useRef, useState } from "react"
import { Button, EmptyState, SkeletonTable } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { pickText } from "@/lib/translation/pick-text"
import PlanEditModal from "./plan-edit-modal"
import { PlanLegend, PlanToolbar, type PlanZoom } from "./plan-toolbar"
import { HEADER_HEIGHT, PlanTreePane, ROW_HEIGHT, i18nOf } from "./plan-tree-pane"
import { PlanTimeline } from "./plan-timeline"
import { useBarDrag } from "./use-bar-drag"
import { usePlanItems } from "./use-plan-items"
import {
  type PlanItem,
  buildFlatTree,
  chartBounds,
  daysBetween,
  formatYmd,
  startOfUtcDay,
  ZOOM_DAY_WIDTH,
} from "./lib/plan-utils"
import { useProjectDocumentTitle } from "@/components/app-shell/project-title-context"

interface Props {
  projectId: string
  canEdit: boolean
}

export function PlanContent({ projectId, canEdit }: Props) {
  const { t, language } = useLanguage()
  useProjectDocumentTitle(t.planTitle)
  const api = usePlanItems(projectId)
  const { items, isLoading } = api
  const [zoom, setZoom] = useState<PlanZoom>("week")
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const itemName = (item: PlanItem) => pickText(i18nOf(item), "name", item.name, language).text
  const flatRows = useMemo(() => buildFlatTree(items, new Set(collapsed)), [items, collapsed])
  const { min: chartMin, max: chartMax } = useMemo(() => chartBounds(items), [items])
  const dayWidth = ZOOM_DAY_WIDTH[zoom]
  const todayX = Math.max(0, daysBetween(chartMin, startOfUtcDay(new Date())) * dayWidth)
  const editing = editingId ? items.find((i) => i.id === editingId) ?? null : null

  // Parent dropdown in the modal — every item in visible order with depth.
  const parentOptions = useMemo(
    () =>
      buildFlatTree(items, new Set()).map((r) => ({
        id: r.item.id,
        name: pickText(i18nOf(r.item), "name", r.item.name, language).text,
        depth: r.depth,
      })),
    [items, language],
  )

  const drag = useBarDrag({
    dayWidth,
    canEdit,
    onPreview: api.previewDates,
    onCommit: (id, plannedStart, plannedEnd) => void api.patchItem(id, { plannedStart, plannedEnd }),
  })

  async function create(initial?: Partial<PlanItem>) {
    const created = await api.createItem(initial)
    // Open the freshly created item for editing right away.
    if (created) setEditingId(created.id)
  }

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function jumpToToday() {
    const el = scrollRef.current
    if (el) el.scrollLeft = Math.max(0, todayX - el.clientWidth / 2)
  }

  return (
    <div className="space-y-4">
      <PlanToolbar
        zoom={zoom}
        onZoom={setZoom}
        onJumpToday={jumpToToday}
        canEdit={canEdit}
        onAddItem={() => void create()}
        onAddMilestone={() => void create({ isMilestone: true, name: t.planAddMilestone, plannedEnd: formatYmd(new Date()) })}
      />
      <PlanLegend />

      {isLoading ? (
        <SkeletonTable rows={6} columns={3} label={t.loading} />
      ) : items.length === 0 ? (
        <div className="rounded-ui-lg border border-dashed border-border bg-surface">
          <EmptyState
            title={t.planEmpty}
            action={canEdit ? <Button onClick={() => void create()}>+ {t.planAddItem}</Button> : undefined}
          />
        </div>
      ) : (
        <div className="rounded-ui-lg border border-border bg-surface overflow-hidden">
          <div className="flex overflow-x-auto" style={{ minHeight: HEADER_HEIGHT + flatRows.length * ROW_HEIGHT }}>
            <PlanTreePane
              rows={flatRows}
              collapsed={collapsed}
              onToggle={toggle}
              onOpen={(item) => setEditingId(item.id)}
              onAddChild={(parentId) => void create({ parentId })}
              itemName={itemName}
              canEdit={canEdit}
              api={api}
            />
            <PlanTimeline
              ref={scrollRef}
              rows={flatRows}
              chartMin={chartMin}
              chartMax={chartMax}
              dayWidth={dayWidth}
              todayX={todayX}
              canEdit={canEdit}
              drag={drag}
              onOpen={(item) => setEditingId(item.id)}
              itemName={itemName}
            />
          </div>
        </div>
      )}

      {editing && (
        <PlanEditModal
          key={editing.id}
          item={editing}
          parentOptions={parentOptions}
          readOnly={!canEdit}
          onClose={() => setEditingId(null)}
          onSave={(patch) => api.patchItem(editing.id, patch, { notifySuccess: true })}
          onDelete={canEdit ? () => api.deleteItem(editing.id) : undefined}
        />
      )}
    </div>
  )
}
