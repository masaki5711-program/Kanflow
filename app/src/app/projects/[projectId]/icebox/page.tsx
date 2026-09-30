"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import MediaPreviewModal, { type MediaItem } from "@/components/media-preview-modal"
import { PbiDraftPickerModal, type PbiDraft } from "@/components/pbi-draft-picker-modal"
import { Button, EmptyState, Input, SkeletonCard, useConfirm, useToast, PageHeader } from "@/components/ui"
import { apiFetch, conflictAwareToast, useApiMutation, useApiQuery, versionConflictOf, versionParam, withVersion } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { IceboxCreateForm } from "./icebox-create-form"
import { IceboxEditModal } from "./icebox-edit-modal"
import { IceboxSection } from "./icebox-section"
import { useIceboxDeepLink } from "./use-icebox-deep-link"
import { Inbox, Plus, Search } from "lucide-react"
import {
  ICEBOX_STATUSES,
  attachmentUrl,
  isPreviewable,
  matchesQuery,
  type IceboxItem,
  type IceboxLists,
  type IceboxStatus,
} from "./types"
import { useProjectDocumentTitle } from "@/components/app-shell/project-title-context"
import { ExcelExportButton } from "@/components/excel/excel-export-button"

interface StatusVars {
  item: IceboxItem
  to: IceboxStatus
}

export default function IceboxPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.projectId as string
  const { t, pt } = useLanguage()
  useProjectDocumentTitle(pt.iceboxTitle)
  const confirm = useConfirm()
  const toast = useToast()

  const url = `/api/projects/${projectId}/icebox`
  const query = useApiQuery<IceboxLists>(url, { toastOnError: (e) => `${t.iceboxLoadFailed}: ${e.message}` })
  const { data: lists, mutate: setLists, refetch } = query

  const [showForm, setShowForm] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [editingItem, setEditingItem] = useState<IceboxItem | null>(null)
  const [draftPickerForId, setDraftPickerForId] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ items: MediaItem[]; index: number } | null>(null)
  useIceboxDeepLink({ lists, isReady: !query.isLoading, clearSearch: () => setSearchQuery("") })

  const statusLabels: Record<IceboxStatus, string> = {
    unreviewed: t.iceboxStatusUnreviewed,
    reviewed: t.iceboxStatusReviewed,
    completed: t.iceboxStatusCompleted,
    frozen: t.iceboxStatusFrozen,
  }

  const changeStatus = useApiMutation(
    ({ item, to }: StatusVars) => apiFetch(`${url}/${item.id}`, { method: "PATCH", json: withVersion({ status: to }, item.version) }),
    {
      onMutate: ({ item, to }) => {
        const prev = lists
        setLists((d) => {
          if (!d) return d
          const from = item.status as IceboxStatus
          return {
            ...d,
            [from]: (d[from] ?? []).filter((i) => i.id !== item.id),
            [to]: [{ ...item, status: to }, ...(d[to] ?? [])],
          }
        })
        return prev
      },
      rollback: (prev) => setLists(prev),
      onSuccess: () => refetch(),
      onError: (e) => {
        if (versionConflictOf(e)) refetch()
      },
      toastOnError: conflictAwareToast((e) => `${t.iceboxStatusChangeFailed}: ${e.message}`),
    },
  )

  const remove = useApiMutation((item: IceboxItem) => apiFetch(`${url}/${item.id}${versionParam(item.version)}`, { method: "DELETE" }), {
    onMutate: (item) => {
      const prev = lists
      const status = item.status as IceboxStatus
      setLists((d) => (d ? { ...d, [status]: (d[status] ?? []).filter((i) => i.id !== item.id) } : d))
      return prev
    },
    rollback: (prev) => setLists(prev),
    onError: (e) => {
      if (versionConflictOf(e)) refetch()
    },
    // Moved to the trash: the toast offers an immediate undo (trash restore).
    onSuccess: (_result, item) => {
      toast.success(t.iceboxDeleted, { action: { label: t.iceboxUndo, onClick: () => void undoDelete(item) } })
    },
    toastOnError: conflictAwareToast((e) => `${t.iceboxDeleteFailed}: ${e.message}`),
  })

  async function undoDelete(item: IceboxItem) {
    try {
      await apiFetch(`/api/projects/${projectId}/trash/icebox_item/${item.id}/restore`, { method: "POST" })
      toast.success(t.trashRestored)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err), { title: t.trashRestoreFailed })
    } finally {
      refetch()
    }
  }

  async function handleDelete(item: IceboxItem) {
    const ok = await confirm({ message: t.iceboxDeleteConfirm, confirmLabel: t.trashMoveToTrash, cancelLabel: t.cancel, variant: "danger" })
    if (ok) void remove.mutate(item)
  }

  function openPreview(item: IceboxItem, startAttachmentId: string) {
    const items: MediaItem[] = (item.attachments ?? [])
      .filter((a) => isPreviewable(a.mimeType))
      .map((a) => ({ id: a.id, originalName: a.originalName, mimeType: a.mimeType, url: attachmentUrl(projectId, item.id, a.id) }))
    if (items.length === 0) return
    const idx = items.findIndex((m) => m.id === startAttachmentId)
    setPreview({ items, index: idx >= 0 ? idx : 0 })
  }

  function handlePickPbiDraft(draft: PbiDraft) {
    if (!draftPickerForId) return
    sessionStorage.setItem(`kanflow:pbiDraft:${projectId}`, JSON.stringify({ ...draft, iceboxItemId: draftPickerForId }))
    setDraftPickerForId(null)
    router.push(`/projects/${projectId}/backlog?fromAiDraft=1`)
  }

  const q = searchQuery.toLowerCase().trim()
  const totalCount = lists ? ICEBOX_STATUSES.reduce((sum, s) => sum + (lists[s]?.length ?? 0), 0) : 0

  return (
    <div>
      <PageHeader
        title={pt.iceboxTitle}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {lists && (
              <span className="rounded-full bg-surface-sunken px-2.5 py-0.5 text-caption font-medium text-fg-muted">{totalCount}</span>
            )}
            <span>{t.iceboxDescription}</span>
          </span>
        }
        icon={
          <span className="block rounded-ui-md bg-primary-soft p-2">
            <Inbox className="h-6 w-6 text-primary" />
          </span>
        }
        actions={
          <>
            <ExcelExportButton href={`/api/projects/${projectId}/icebox/export`} />
            <Button onClick={() => setShowForm(true)} disabled={showForm} leftIcon={<Plus className="h-4 w-4" />}>
              {t.iceboxAddRequest}
            </Button>
          </>
        }
      />

      <div className="relative mb-5">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
          <Search className="h-4 w-4 text-fg-subtle" />
        </div>
        <Input
          type="search"
          inputSize="lg"
          aria-label={t.iceboxSearchLabel}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={`${pt.iceboxRequest} / ${pt.iceboxBackground}`}
          className="pl-10"
        />
      </div>

      {showForm && <IceboxCreateForm projectId={projectId} onCreated={refetch} onClose={() => setShowForm(false)} />}

      {query.isLoading ? (
        <div className="space-y-6">
          <SkeletonCard label={t.loading} />
          <SkeletonCard />
        </div>
      ) : !lists ? (
        <EmptyState
          title={t.iceboxLoadFailed}
          description={query.error?.message}
          action={<Button onClick={refetch}>{t.backlogRetry}</Button>}
        />
      ) : (
        <div className="space-y-6">
          {ICEBOX_STATUSES.map((status) => (
            <IceboxSection
              key={status}
              projectId={projectId}
              title={statusLabels[status]}
              status={status}
              items={(lists[status] ?? []).filter((i) => matchesQuery(i, q))}
              statusLabels={statusLabels}
              onAdd={showForm ? undefined : () => setShowForm(true)}
              onChangeStatus={(item, to) => void changeStatus.mutate({ item, to })}
              onEdit={setEditingItem}
              onDelete={handleDelete}
              onGenerateDraft={(item) => setDraftPickerForId(item.id)}
              onPreview={openPreview}
            />
          ))}
        </div>
      )}

      {editingItem && (
        <IceboxEditModal projectId={projectId} item={editingItem} onClose={() => setEditingItem(null)} onChanged={refetch} />
      )}
      {preview && <MediaPreviewModal items={preview.items} startIndex={preview.index} onClose={() => setPreview(null)} />}
      {draftPickerForId && (
        <PbiDraftPickerModal
          key={draftPickerForId}
          projectId={projectId}
          iceboxItemId={draftPickerForId}
          onClose={() => setDraftPickerForId(null)}
          onPick={handlePickPbiDraft}
          onAddedToIcebox={refetch}
        />
      )}
    </div>
  )
}
