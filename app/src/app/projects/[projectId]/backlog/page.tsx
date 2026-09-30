"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import PbiDetailModal from "@/components/pbi-detail-modal"
import { PbiCreateModal } from "@/components/pbi-create-modal"
import { AIResultModal } from "@/components/ai-result-modal"
import { announce } from "@/components/live-announcer"
import type { PbiForm } from "@/components/pbi-form/pbi-form-state"
import type { PbiFormOptions } from "@/components/pbi-form/use-pbi-form-options"
import { Button, EmptyState, PageHeader, SkeletonCard, useConfirm, useToast } from "@/components/ui"
import { useProjectDocumentTitle } from "@/components/app-shell/project-title-context"
import { useStableHandlers } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { BacklogSection } from "./backlog-section"
import { BacklogToolbar } from "./backlog-toolbar"
import { BulkActionBar } from "./bulk-action-bar"
import { DND_HELP_ID, type CardActions } from "./backlog-item-card"
import { DoneSection } from "./done-section"
import { applyVisibleMove, moveItem } from "./reorder"
import type { BacklogItem, BacklogStatus } from "./types"
import { pbiIdForRef } from "./url-state"
import { useBacklogData } from "./use-backlog-data"
import { useBacklogUrlState } from "./use-backlog-url-state"
import { DONE_PAGE_SIZE, useBacklogView } from "./use-backlog-view"
import { useBacklogSelection, useBulkActions } from "./use-bulk-actions"
import { useDraftPrefill } from "./use-draft-prefill"
import { useReorderDnd } from "./use-reorder-dnd"
import { ClipboardList, Plus, Scale } from "lucide-react"
import { BacklogExcelActions } from "@/components/excel/backlog-excel-actions"

/** useSearchParams needs a Suspense boundary above it. */
export default function BacklogPage() {
  return (
    <Suspense fallback={<BacklogSkeleton />}>
      <BacklogPageContent />
    </Suspense>
  )
}

function BacklogSkeleton() {
  const { t } = useLanguage()
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <SkeletonCard label={t.loading} />
      <SkeletonCard />
    </div>
  )
}

function BacklogPageContent() {
  const params = useParams()
  const projectId = params.projectId as string
  const { t, pt, language } = useLanguage()
  useProjectDocumentTitle(pt.backlogTitle)
  const confirm = useConfirm()
  const toast = useToast()
  const url = useBacklogUrlState()
  const data = useBacklogData(projectId)
  const { backlog, canEdit, canReorder, canDelete } = data
  const [doneLimit, setDoneLimit] = useState(DONE_PAGE_SIZE)
  const view = useBacklogView(backlog.data, url.filters, doneLimit)
  const selection = useBacklogSelection(view.orderedIds)
  const bulk = useBulkActions(projectId, { refetch: backlog.refetch, onTrashed: data.showTrashUndo, onDone: selection.clear })

  const [createDraft, setCreateDraft] = useState<Partial<PbiForm> | null>(null)
  const [editIntent, setEditIntent] = useState<string | null>(null)
  const [investPbiId, setInvestPbiId] = useState<string | null>(null)

  // A draft generated from the IceBox opens the create modal pre-filled.
  useDraftPrefill(projectId, (draft) => setCreateDraft({ ...draft, workloadScore: String(draft.workloadScore) }))

  // ?pbi= deep link (id, displayId or #displayId). A number needs the list to resolve.
  const ref = url.pbiRef
  const all = view.all
  const detailId = useMemo(() => {
    if (!ref) return null
    if (!backlog.data && /^#?\d+$/.test(ref.trim())) return null
    return pbiIdForRef(ref, all)
  }, [ref, all, backlog.data])
  const unresolved = !!ref && !!backlog.data && detailId === null
  const closePbi = url.closePbi
  useEffect(() => {
    if (!unresolved || !ref) return
    toast.error(t.backlogPbiNotFound.replace("{ref}", ref))
    closePbi()
  }, [unresolved, ref, toast, t, closePbi])

  const formOptions = useMemo<PbiFormOptions>(
    () => ({ iceboxOptions: data.iceboxOptions, goals: data.goals, pointUnit: data.pointUnit, iceboxUsage: view.iceboxUsage }),
    [data.iceboxOptions, data.goals, data.pointUnit, view.iceboxUsage],
  )

  function persistOrder(section: BacklogStatus, ordered: BacklogItem[], item: BacklogItem) {
    void data.reorder.mutate({ status: section, ordered })
    const pos = ordered.findIndex((i) => i.id === item.id) + 1
    announce(t.backlogMovedAnnounce.replace("{id}", String(item.displayId)).replace("{pos}", String(pos)))
  }

  /** Drop from drag & drop: `toIndex` is in the visible list; hidden (filtered) items keep their slots. */
  const dnd = useReorderDnd((section, itemId, toIndex) => {
    const item = view.lists[section].find((i) => i.id === itemId)
    if (!item) return
    const visibleIds = view.visible[section].map((i) => i.id)
    persistOrder(section, applyVisibleMove(view.lists[section], visibleIds, itemId, toIndex), item)
  })

  function dragTarget(item: BacklogItem) {
    const section = item.status as BacklogStatus
    return { section, itemId: item.id, displayId: item.displayId, ids: view.visible[section].map((i) => i.id) }
  }

  async function handleDelete(item: BacklogItem) {
    const ok = await confirm({ message: t.backlogDeleteConfirm, confirmLabel: t.trashMoveToTrash, cancelLabel: t.cancel, variant: "danger" })
    if (ok) void data.remove.mutate(item)
  }

  // Stable handler identities keep the memoized cards from re-rendering on every keystroke.
  const cardActions: CardActions = useStableHandlers({
    onOpen: (item: BacklogItem, mode: "read" | "edit") => {
      setEditIntent(mode === "edit" ? item.id : null)
      url.openPbi(String(item.displayId))
    },
    onStatusChange: (item: BacklogItem, to: BacklogStatus) => void data.changeStatus.mutate({ item, from: item.status as BacklogStatus, to }),
    onDelete: handleDelete,
    onInvest: (item: BacklogItem) => setInvestPbiId(item.id),
    onToggleSelect: (item: BacklogItem, shift: boolean) => selection.toggle(item.id, shift),
    onMoveToEdge: (item: BacklogItem, edge: "top" | "bottom") => {
      const section = item.status as BacklogStatus
      const full = view.lists[section]
      const from = full.findIndex((i) => i.id === item.id)
      const to = edge === "top" ? 0 : full.length - 1
      if (from >= 0 && from !== to) persistOrder(section, moveItem(full, from, to), item)
    },
    onHandleKeyDown: (e, item: BacklogItem) => dnd.onHandleKeyDown(e, dragTarget(item)),
    onHandlePointerDown: (e, item: BacklogItem) => dnd.onHandlePointerDown(e, dragTarget(item), e.currentTarget.closest("ul")),
    onHandleBlur: () => dnd.onHandleBlur(),
  })

  const perms = { canEdit, canReorder, canDelete }
  const sectionProps = { ...perms, actions: cardActions, selectMode: selection.selectMode, selectedIds: selection.selectedSet, drag: dnd.drag }
  const status = url.filters.status
  const loaded = backlog.data

  return (
    <div className="mx-auto max-w-5xl">
      <p id={DND_HELP_ID} hidden>
        {t.backlogDragHelp}
      </p>

      <PageHeader
        title={pt.backlogTitle}
        icon={<ClipboardList className="h-7 w-7 text-primary" />}
        description={
          loaded && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1 text-caption font-medium text-primary-active">
              <Scale className="h-3.5 w-3.5" />
              {t.reportTotalWorkload}: {loaded.totalWorkload}
            </span>
          )
        }
        actions={
          <>
            <BacklogExcelActions projectId={projectId} canImport={canEdit} onImported={backlog.refetch} />
            {canEdit && (
              <Button onClick={() => setCreateDraft({})} leftIcon={<Plus className="h-4 w-4" />}>
                {t.backlogAddItem}
              </Button>
            )}
          </>
        }
      />

      {data.roleError && (
        <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-ui-md border border-warning/30 bg-warning-soft px-4 py-3 text-body text-warning-strong">
          <span>{t.backlogRoleLoadFailed}</span>
          <Button variant="secondary" size="sm" onClick={data.retryRole}>
            {t.backlogRetry}
          </Button>
        </div>
      )}

      <BacklogToolbar
        filters={url.filters}
        facets={view.facets}
        onChange={url.setFilters}
        shown={view.shown}
        total={view.total}
        selectMode={canEdit || canDelete ? { active: selection.selectMode, onToggle: () => selection.setMode(!selection.selectMode) } : undefined}
      />

      {backlog.isLoading ? (
        <div className="space-y-6">
          <SkeletonCard label={t.loading} />
          <SkeletonCard />
        </div>
      ) : !loaded ? (
        <EmptyState title={t.backlogLoadFailed} description={backlog.error?.message} action={<Button onClick={backlog.refetch}>{t.backlogRetry}</Button>} />
      ) : (
        <div className="space-y-6">
          {(!status || status === "ready") && (
            <BacklogSection title={t.backlogSectionReadyTitle} hint={t.backlogReadyHint} status="ready" items={view.visible.ready} showWorkloadTotal {...sectionProps} />
          )}
          {(!status || status === "not_ready") && (
            <BacklogSection
              title={t.backlogSectionNotReadyTitle}
              hint={t.backlogNotReadyHint}
              status="not_ready"
              items={view.visible.not_ready}
              onAdd={() => setCreateDraft({})}
              {...sectionProps}
            />
          )}
          {(!status || status === "completed") && (
            <DoneSection
              items={view.visible.completed}
              matches={view.doneMatches}
              expanded={view.showDone}
              onToggle={() => url.setFilters({ showDone: !url.filters.showDone })}
              onShowMore={() => setDoneLimit((n) => n + DONE_PAGE_SIZE)}
              {...sectionProps}
            />
          )}
        </div>
      )}

      {selection.selectMode && (
        <BulkActionBar
          projectId={projectId}
          count={selection.selectedIds.length}
          busy={bulk.isPending}
          canEdit={canEdit}
          canDelete={canDelete}
          members={data.members}
          onApply={(request) => void bulk.mutate({ ids: selection.selectedIds, request })}
          onSelectAll={selection.selectAll}
          onClear={selection.clear}
        />
      )}

      {detailId && (
        <PbiDetailModal
          key={detailId}
          projectId={projectId}
          pbiId={detailId}
          editable={canEdit}
          initialMode={editIntent === detailId ? "edit" : "read"}
          formOptions={formOptions}
          onSaved={backlog.refetch}
          onClose={() => {
            setEditIntent(null)
            url.closePbi()
          }}
        />
      )}
      {createDraft && (
        <PbiCreateModal
          projectId={projectId}
          initialForm={createDraft}
          formOptions={formOptions}
          onCreated={() => backlog.refetch()}
          onClose={() => setCreateDraft(null)}
        />
      )}
      {investPbiId && (
        <AIResultModal
          title={t.aiInvestTitle}
          fetchUrl={`/api/projects/${projectId}/backlog/${investPbiId}/ai/invest-review`}
          fetchBody={{ lang: language }}
          onClose={() => setInvestPbiId(null)}
        />
      )}
    </div>
  )
}
