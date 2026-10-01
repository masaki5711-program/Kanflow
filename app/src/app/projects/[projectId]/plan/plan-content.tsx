"use client"

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CalendarRange } from "lucide-react"
import { Button, EmptyState, SkeletonTable, useConfirm, useToast } from "@/components/ui"
import { useApiQuery, useMediaQuery, useStableHandlers } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { pickText } from "@/lib/translation/pick-text"
import type { ProjectMemberDto } from "@/types/api"
import { useProjectDocumentTitle } from "@/components/app-shell/project-title-context"
import { addDays, dayToYmd, localTodayYmd } from "./lib/date"
import { formatShortDate } from "./lib/date-format"
import { EMPTY_FILTER, isFilterActive, matchesFilter, type PlanFilter } from "./lib/filter"
import { dayCenterX, spanGeometry } from "./lib/geometry"
import type { PlanItem } from "./lib/plan-types"
import { fullPlanRange, visibleRange, type PrintScope } from "./lib/print"
import type { ChartRange, PlanZoom } from "./lib/scale"
import { fillTemplate } from "./lib/template"
import { ancestorIds, buildFlatTree, descendantIds, dropItem, filterVisibleIds, indentItem, moveSibling, outdentItem, parentIds } from "./lib/tree"
import { firstViewTarget, fitTarget } from "./lib/fit-view"
import { useBarDrag } from "./hooks/use-bar-drag"
import { useLinkDrag } from "./hooks/use-link-drag"
import { usePlanData } from "./hooks/use-plan-data"
import { useNameAutoWidth } from "./hooks/use-name-auto-width"
import { usePlanLayout } from "./hooks/use-plan-layout"
import { usePlanPrint } from "./hooks/use-plan-print"
import { revealItem, scrollTimelineTo, useInitialScroll } from "./hooks/use-plan-scroll"
import { usePlanViewState } from "./hooks/use-plan-view-state"
import { useRowDrag } from "./hooks/use-row-drag"
import { useTimelineViewport } from "./hooks/use-timeline-viewport"
import type { ChartEnv, RowHandlers } from "./components/chart-types"
import { PlanChart, chartBodyOf } from "./components/plan-chart"
import { PlanChartFrame } from "./components/plan-chart-frame"
import PlanEditModal, { type EditorTarget } from "./components/plan-edit-modal"
import { PlanFilterBar } from "./components/plan-filter-bar"
import { PlanLegend } from "./components/plan-legend"
import { PlanPrintDialog } from "./components/plan-print-dialog"
import { PlanSuccessorPicker } from "./components/plan-successor-picker"
import { PlanToolbar } from "./components/plan-toolbar"

interface Props {
  projectId: string
  canEdit: boolean
}

const NO_MEMBERS: ProjectMemberDto[] = []
const DRAFT_DAYS = 7
/** A4 landscape page for the plan printout (see lib/print.ts PRINT_WIDTH). */
const PRINT_PAGE_CSS = "@page { size: A4 landscape; margin: 8mm; }"

function rangeLabel(range: ChartRange, language: Parameters<typeof formatShortDate>[1], template: string): string {
  return fillTemplate(template, {
    start: formatShortDate(dayToYmd(range.startDay), language),
    end: formatShortDate(dayToYmd(range.startDay + range.days - 1), language),
  })
}

/** Master plan page (client). useSearchParams needs the Suspense boundary. */
export function PlanContent(props: Props) {
  return (
    <Suspense fallback={<SkeletonTable rows={6} columns={3} />}>
      <PlanPage {...props} />
    </Suspense>
  )
}

function focusName(id: string) {
  requestAnimationFrame(() => {
    const el = Array.from(document.querySelectorAll<HTMLElement>("[data-plan-name]")).find((b) => b.dataset.planName === id)
    el?.focus()
  })
}

function PlanPage({ projectId, canEdit }: Props) {
  const { t, language } = useLanguage()
  useProjectDocumentTitle(t.planTitle)
  const toast = useToast()
  const confirm = useConfirm()
  const api = usePlanData(projectId)
  const { items, dependencies } = api.data
  const today = api.data.today || localTodayYmd()
  const isNarrow = useMediaQuery("(max-width: 767px)")
  const isTablet = useMediaQuery("(max-width: 1023px)")
  const isPhone = useMediaQuery("(max-width: 639px)")
  const isWide = useMediaQuery("(min-width: 1280px)")
  const view = usePlanViewState(projectId, isTablet)
  const membersQuery = useApiQuery<ProjectMemberDto[]>(`/api/projects/${projectId}/members`)
  const members = useMemo(() => (membersQuery.data ?? NO_MEMBERS).map((m) => ({ id: m.user.id, name: m.user.name })), [membersQuery.data])

  const [filter, setFilter] = useState<PlanFilter>(EMPTY_FILTER)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [editor, setEditor] = useState<EditorTarget | null>(null)
  const [successorFor, setSuccessorFor] = useState<PlanItem | null>(null)
  const [printOpen, setPrintOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const nameOf = useCallback((item: PlanItem) => pickText(item.i18n, "name", item.name, language).text, [language])
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const collapsed = useMemo(() => new Set(view.prefs.collapsed), [view.prefs.collapsed])
  const filterOn = isFilterActive(filter)
  const visible = useMemo(
    () => (filterOn ? filterVisibleIds(items, (i) => matchesFilter(i, filter, nameOf(i))) : null),
    [filter, filterOn, items, nameOf],
  )
  const rows = useMemo(() => buildFlatTree(items, filterOn ? new Set() : collapsed, visible), [items, collapsed, filterOn, visible])
  const rowIds = useMemo(() => rows.map((r) => r.item.id), [rows])
  // Every row (nothing collapsed) sizes the default name column, so it does not jump on expand / collapse.
  const allRows = useMemo(() => buildFlatTree(items, new Set(), null), [items])
  const autoName = useNameAutoWidth(allRows, nameOf, isWide)

  const { zoom } = view
  const ready = !api.isLoading && items.length > 0
  const viewport = useTimelineViewport(scrollRef, ready && rows.length > 0)
  // Called on a print click (after this render), so the screen layout below is initialised.
  const currentVisibleRange = () => visibleRange(range.startDay, dayWidth, viewport.scrollLeft, viewport.clientWidth - gw)
  const printFlow = usePlanPrint(currentVisibleRange)
  const layout = usePlanLayout({
    items,
    today,
    zoom,
    language,
    prefs: view.prefs,
    shown: view.columns,
    isNarrow,
    isTablet,
    isPhone,
    containerWidth: viewport.clientWidth,
    autoNameWidth: autoName,
    print: printFlow.request,
  })
  const { range, dayWidth, scale, columns, gridCollapsed, nameWidth } = layout
  const gw = layout.gridWidth
  const env = useMemo<ChartEnv>(
    () => ({ t, language, startDay: range.startDay, dayWidth, today, canEdit, columns, gridWidth: gw, nameWidth, gridCollapsed, printing: layout.printing, nameOf }),
    [t, language, range.startDay, dayWidth, today, canEdit, columns, gw, nameWidth, gridCollapsed, layout.printing, nameOf],
  )
  const todayX = dayCenterX(today, range.startDay, dayWidth)
  // First view: the earliest unfinished / overdue work (or today); an empty window fits everything instead (A3-09).
  const shownItems = useMemo(() => rows.map((r) => r.item), [rows])
  const visibleWidth = (clientWidth: number) => clientWidth - gw
  const applyView = useInitialScroll(
    scrollRef,
    ready,
    (clientWidth, isFirst) => firstViewTarget(items, shownItems, today, zoom, visibleWidth(clientWidth), isFirst),
    zoom,
    (z) => view.setZoom(z as PlanZoom),
    !!view.itemParam,
  )
  const fitAll = () => applyView(fitTarget(items, shownItems, today, visibleWidth(scrollRef.current?.clientWidth ?? 0)))

  const drag = useBarDrag({
    dayWidth,
    canEdit,
    onPreview: api.previewDates,
    onCommit: (item, plannedStart, plannedEnd) => void api.patchItem(item, { plannedStart, plannedEnd }),
  })
  const rowDrag = useRowDrag({
    getBody: () => chartBodyOf(scrollRef.current),
    rowIds,
    onDrop: (dragId, target) => void api.reorder(dropItem(items, dragId, target.targetId, target.position)),
  })

  const successorReasons = { cycle: t.planSuccessorBlockedCycle, hierarchy: t.planSuccessorBlockedHierarchy, existing: t.planSuccessorBlockedExisting }
  const linkDrag = useLinkDrag({
    getBody: () => chartBodyOf(scrollRef.current),
    getScroller: () => scrollRef.current,
    gridWidth: gw,
    rowIds,
    items,
    dependencies,
    onLink: (predecessorId, successorId) => void api.addDependency(predecessorId, successorId),
    onRejected: (block) => toast.error(successorReasons[block], { title: t.planDependencyAddFailed }),
  })

  async function confirmRemoveArrow(arrow: { id: string; predecessorId: string; successorId: string }) {
    const from = byId.get(arrow.predecessorId)
    const to = byId.get(arrow.successorId)
    const ok = await confirm({
      title: t.depPlanRemoveTitle,
      message: fillTemplate(t.depPlanRemoveMessage, { from: from ? nameOf(from) : "", to: to ? nameOf(to) : "" }),
      confirmLabel: t.delete,
      cancelLabel: t.cancel,
      variant: "warning",
    })
    if (ok) void api.removeDependency(arrow.id)
  }

  function reveal(id: string) {
    const it = byId.get(id)
    if (!it) return
    const g = spanGeometry(it.plannedStart, it.plannedEnd, range.startDay, dayWidth)
    revealItem(scrollRef.current, id, g.x, g.width, gw)
  }

  function openDraft(parentId: string | null, isMilestone: boolean) {
    setEditor({ kind: "draft", draft: { parentId, isMilestone, plannedStart: today, plannedEnd: isMilestone ? today : addDays(today, DRAFT_DAYS - 1) } })
  }

  async function requestDelete(item: PlanItem): Promise<boolean> {
    const name = nameOf(item)
    const count = descendantIds(items, item.id).length
    const message = [count > 0 ? fillTemplate(t.planConfirmDeleteDescendants, { count }) : "", t.planConfirmDeleteTrash].filter(Boolean).join("\n")
    const ok = await confirm({ title: fillTemplate(t.planConfirmDelete, { name }), message, confirmLabel: t.delete, cancelLabel: t.cancel, variant: "danger" })
    if (!ok) return false
    const deleted = await api.deleteItem(item, name)
    if (deleted && selectedId === item.id) setSelectedId(null)
    return deleted
  }

  async function confirmBaseline(clear: boolean) {
    const ok = await confirm({
      message: clear ? t.planBaselineClearConfirm : t.planBaselineSaveConfirm,
      confirmLabel: clear ? t.planBaselineClear : t.planBaselineSave,
      cancelLabel: t.cancel,
      variant: clear ? "warning" : "info",
    })
    if (ok) void (clear ? api.clearBaseline() : api.saveBaseline())
  }

  const handlers = useStableHandlers<RowHandlers>({
    select: (id, options) => {
      setSelectedId(id)
      if (options?.scrollBar) reveal(id)
    },
    open: (item) => setEditor({ kind: "edit", item }),
    toggle: (id) => view.setCollapsed((prev) => (prev.has(id) ? [...prev].filter((x) => x !== id) : [...prev, id])),
    startRename: (id) => setRenamingId(id),
    commitRename: (item, name) => {
      setRenamingId(null)
      focusName(item.id)
      void api.patchItem(item, { name })
    },
    cancelRename: () => {
      if (renamingId) focusName(renamingId)
      setRenamingId(null)
    },
    move: (id, action) => {
      const updates =
        action === "moveUp" ? moveSibling(items, id, "up")
          : action === "moveDown" ? moveSibling(items, id, "down")
            : action === "indent" ? indentItem(items, id)
              : outdentItem(items, id)
      if (action === "indent" && updates?.[0]?.parentId) view.setCollapsed((prev) => [...prev].filter((x) => x !== updates[0].parentId))
      void api.reorder(updates).then(() => focusName(id))
    },
    addChild: (parentId) => openDraft(parentId, false),
    addSuccessor: (item) => setSuccessorFor(item),
    startLink: (e, id) => {
      setSelectedId(id)
      linkDrag.onConnectorPointerDown(e, id)
    },
    pickArrow: (arrow) => void confirmRemoveArrow(arrow),
    linkPbis: (item) => setEditor({ kind: "edit", item, focusLinks: true }),
    remove: (item) => void requestDelete(item),
  })

  // ?item=<id>: reveal, select and open the item once the plan has loaded (notifications, PBI link).
  const handledItemRef = useRef<string | null>(null)
  const { itemParam, clearItemParam, setCollapsed } = view
  useEffect(() => {
    if (!itemParam || api.isLoading || handledItemRef.current === itemParam) return
    handledItemRef.current = itemParam
    const item = byId.get(itemParam)
    clearItemParam()
    if (!item) {
      toast.error(t.planItemNotFound)
      return
    }
    const ancestors = new Set(ancestorIds(items, item.id))
    setCollapsed((prev) => [...prev].filter((x) => !ancestors.has(x)))
    setFilter(EMPTY_FILTER)
    setSelectedId(item.id)
    setEditor({ kind: "edit", item })
    requestAnimationFrame(() => reveal(item.id))
    // reveal reads the latest geometry through closure; only the param / load state trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemParam, api.isLoading, byId])

  const editorItem = editor?.kind === "edit" ? (byId.get(editor.item.id) ?? editor.item) : null
  const hasBaseline = items.some((i) => i.baselineStart)

  return (
    <div className="space-y-4">
      <PlanToolbar
        zoom={zoom}
        onZoom={view.setZoom}
        onJumpToday={() => scrollTimelineTo(scrollRef.current, todayX, gw)}
        onFitAll={fitAll}
        fitDisabled={!ready || rows.length === 0}
        canEdit={canEdit}
        onAddItem={() => openDraft(null, false)}
        onAddMilestone={() => openDraft(null, true)}
        onSaveBaseline={() => void confirmBaseline(false)}
        onClearBaseline={() => void confirmBaseline(true)}
        hasBaseline={hasBaseline}
        exportUrl={`${api.base}/export?lang=${language}`}
        onPrint={() => setPrintOpen(true)}
      />
      {layout.printing && <style>{PRINT_PAGE_CSS}</style>}

      {api.isLoading ? (
        <SkeletonTable rows={6} columns={4} label={t.loading} />
      ) : items.length === 0 ? (
        <div className="rounded-ui-lg border border-dashed border-border-strong bg-surface">
          <EmptyState
            icon={<CalendarRange className="h-6 w-6" />}
            title={t.planEmpty}
            description={t.planEmptyHint}
            action={canEdit ? <Button onClick={() => openDraft(null, false)}>{t.planAddItem}</Button> : undefined}
          />
        </div>
      ) : (
        <>
          <PlanFilterBar
            filter={filter}
            onFilter={setFilter}
            owners={members}
            shownColumns={view.columns}
            hiddenColumns={layout.hiddenColumns}
            onToggleColumn={view.toggleColumn}
            phoneLayout={isPhone ? (view.prefs.phoneLayout ?? "timeline") : null}
            onPhoneLayout={view.setPhoneLayout}
            columnsDisabled={gridCollapsed}
            onExpandAll={() => view.setCollapsed(() => [])}
            onCollapseAll={() => view.setCollapsed(() => parentIds(items))}
            shown={visible?.size ?? items.length}
            total={items.length}
          />
          {rows.length === 0 ? (
            <div className="rounded-ui-lg border border-border bg-surface">
              <EmptyState compact title={t.planNoMatches} action={<Button variant="secondary" onClick={() => setFilter(EMPTY_FILTER)}>{t.planClearFilters}</Button>} />
            </div>
          ) : (
            <PlanChartFrame
              t={t}
              scrollRef={scrollRef}
              viewport={viewport}
              rows={rows}
              startDay={range.startDay}
              dayWidth={dayWidth}
              gridWidth={gw}
              nameWidth={nameWidth}
              nameBounds={layout.nameBounds}
              onNameWidth={view.setNameWidth}
              splitter={!layout.phoneNames}
              today={{ x: todayX, label: formatShortDate(today, language) }}
              printing={layout.printing}
            >
              <PlanChart
                ref={scrollRef}
                rows={rows}
                byId={byId}
                dependencies={dependencies}
                scale={scale}
                env={env}
                handlers={handlers}
                drag={drag.handlers}
                live={drag.live}
                selectedId={selectedId}
                collapsed={filterOn ? new Set() : collapsed}
                renamingId={renamingId}
                todayLabel={fillTemplate(t.planTodayLabel, { date: formatShortDate(today, language) })}
                view={layout.printing ? null : { left: viewport.scrollLeft, width: viewport.clientWidth - gw }}
                onToggleGrid={() => view.setGridCollapsed(!gridCollapsed)}
                rowDrop={rowDrag.target}
                onHandlePointerDown={rowDrag.onHandlePointerDown}
                link={linkDrag.link}
                onPickArrow={handlers.pickArrow}
              />
            </PlanChartFrame>
          )}
          <PlanLegend canEdit={canEdit} />
        </>
      )}

      {editor && (
        <PlanEditModal
          key={editor.kind === "edit" ? editor.item.id : "draft"}
          target={editorItem ? { kind: "edit", item: editorItem, focusLinks: editor.kind === "edit" && editor.focusLinks } : editor}
          apiBase={api.base}
          backlogPath={`/projects/${projectId}/backlog`}
          items={items}
          dependencies={dependencies}
          members={members}
          readOnly={!canEdit}
          nameOf={nameOf}
          onClose={() => setEditor(null)}
          onCreate={async (input) => {
            const created = await api.createItem(input)
            if (created) setSelectedId(created.id)
            return !!created
          }}
          onSave={(item, patch, onConflict) => api.patchItem(item, patch, { notify: true, onConflict })}
          onDelete={requestDelete}
          onRemoveDependency={(id) => void api.removeDependency(id)}
          onLinksSaved={api.refetch}
        />
      )}
      {printOpen && (
        <PlanPrintDialog
          ranges={{
            visible: rangeLabel(currentVisibleRange(), language, t.planPrintRange),
            all: rangeLabel(fullPlanRange(items, today), language, t.planPrintRange),
          }}
          onClose={() => setPrintOpen(false)}
          onPrint={(scope: PrintScope) => {
            setPrintOpen(false)
            printFlow.print(scope)
          }}
        />
      )}
      {successorFor && (
        <PlanSuccessorPicker
          predecessor={successorFor}
          items={items}
          dependencies={dependencies}
          nameOf={nameOf}
          onClose={() => setSuccessorFor(null)}
          onPick={(successorId) => {
            setSuccessorFor(null)
            void api.addDependency(successorFor.id, successorId)
          }}
        />
      )}
    </div>
  )
}
