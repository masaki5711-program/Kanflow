"use client"

import { useMemo, useState } from "react"
import { useParams } from "next/navigation"
import PbiDetailModal from "@/components/pbi-detail-modal"
import { AIResultModal } from "@/components/ai-result-modal"
import { Button, EmptyState, Input, PageHeader, SkeletonCard, useUiLabels, useConfirm } from "@/components/ui"
import { useProjectDocumentTitle } from "@/components/app-shell/project-title-context"
import {
  apiFetch,
  conflictAwareToast,
  useApiMutation,
  useStableHandlers,
  useUnsavedChangesGuard,
  versionConflictOf,
  withVersion,
} from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { BacklogForm, type IceboxUsage } from "./backlog-form"
import { BacklogSection } from "./backlog-section"
import {
  EMPTY_FORM,
  formFromItem,
  isFormEqual,
  matchesQuery,
  swapped,
  type BacklogForm as FormState,
  type BacklogFormSource,
  type BacklogItem,
  type BacklogStatus,
} from "./types"
import { useAiFieldGenerator } from "./use-ai-field-generator"
import { useBacklogData } from "./use-backlog-data"
import { useDraftPrefill } from "./use-draft-prefill"
import { ChevronDown, ClipboardList, Plus, Scale, Search } from "lucide-react"

interface SaveVars {
  editingId: string | null
  form: FormState
  /** Optimistic-lock version of the PBI being edited. */
  version?: number
}

export default function BacklogPage() {
  const params = useParams()
  const projectId = params.projectId as string
  const { t, pt, language } = useLanguage()
  useProjectDocumentTitle(pt.backlogTitle)
  const ui = useUiLabels()
  const confirm = useConfirm()
  const data = useBacklogData(projectId)
  const { backlog, canEdit } = data

  const [detailPbiId, setDetailPbiId] = useState<string | null>(null)
  const [investPbiId, setInvestPbiId] = useState<string | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [announcement, setAnnouncement] = useState("")

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [initialForm, setInitialForm] = useState<FormState>(EMPTY_FORM)
  const [editingVersion, setEditingVersion] = useState<number | undefined>(undefined)
  const isDirty = formOpen && !isFormEqual(form, initialForm)
  useUnsavedChangesGuard(isDirty)

  const ai = useAiFieldGenerator(projectId, form, setForm)

  function openForm(next: FormState, id: string | null, baseline: FormState = next) {
    setEditingId(id)
    setForm(next)
    setInitialForm(baseline)
    setFormOpen(true)
  }

  function closeForm() {
    setFormOpen(false)
    setEditingId(null)
    setEditingVersion(undefined)
    setForm(EMPTY_FORM)
    setInitialForm(EMPTY_FORM)
  }

  // A draft generated from the IceBox pre-fills a new PBI (compared against
  // the empty form so leaving it unsaved still asks first).
  useDraftPrefill(projectId, (draft) => openForm({ ...EMPTY_FORM, ...draft }, null, EMPTY_FORM))

  async function confirmDiscard(): Promise<boolean> {
    if (!isDirty) return true
    return confirm({
      title: ui.unsavedTitle,
      message: ui.unsavedMessage,
      confirmLabel: ui.discard,
      cancelLabel: t.cancel,
      variant: "warning",
    })
  }

  const all = backlog.data
  const lists: Record<BacklogStatus, BacklogItem[]> = useMemo(
    () => ({
      ready: all?.readyItems ?? [],
      not_ready: all?.notReadyItems ?? [],
      completed: all?.completedItems ?? [],
    }),
    [all],
  )

  // "Which IceBox items are already referenced by another PBI?" — surfaced as
  // ⚠ tags in the dropdown and as a confirm-before-reuse dialog. The PBI being
  // edited is excluded so users aren't warned about self-references.
  const iceboxUsage = useMemo(() => {
    const map = new Map<string, IceboxUsage>()
    const every = [...(all?.readyItems ?? []), ...(all?.notReadyItems ?? []), ...(all?.completedItems ?? [])]
    for (const pbi of every) {
      if (!pbi.iceboxItemId || editingId === pbi.id) continue
      map.set(pbi.iceboxItemId, { displayId: pbi.displayId, label: pbi.initiative || pbi.userStory || `#${pbi.displayId}` })
    }
    return map
  }, [all, editingId])

  const save = useApiMutation(
    ({ editingId: id, form: f, version }: SaveVars) =>
      apiFetch(id ? `/api/projects/${projectId}/backlog/${id}` : `/api/projects/${projectId}/backlog`, {
        method: id ? "PATCH" : "POST",
        // Raw text is saved as typed; the other language is prepared by the
        // background translation worker (lib/translation).
        json: withVersion({
          initiative: f.initiative || undefined,
          epic: f.epic || undefined,
          userStory: f.userStory || undefined,
          acceptanceCriteria: f.acceptanceCriteria || undefined,
          workloadScore: f.workloadScore,
          status: f.status,
          iceboxItemId: f.iceboxItemId || undefined,
          productGoalId: f.productGoalId || null,
        }, id ? version : undefined),
      }),
    {
      onSuccess: () => {
        closeForm()
        backlog.refetch()
      },
      // Someone else saved the PBI first: show their version in the form and reload the list.
      onError: (e) => {
        const conflict = versionConflictOf<BacklogFormSource & { version?: number }>(e)
        if (!conflict) return
        if (conflict.current) {
          const latest = formFromItem(conflict.current)
          setForm(latest)
          setInitialForm(latest)
          setEditingVersion(conflict.current.version)
        }
        backlog.refetch()
      },
      toastOnError: conflictAwareToast((e) => `${t.backlogSaveFailed}: ${e.message}`),
      toastOnSuccess: t.backlogSaved,
    },
  )

  function handleSubmit() {
    // Never save while an AI stream is still writing into the form.
    if (ai.generating || save.isPending) return
    void save.mutate({ editingId, form, version: editingVersion })
  }

  async function handleCancel() {
    if (await confirmDiscard()) closeForm()
  }

  async function handleAdd() {
    if (await confirmDiscard()) openForm(EMPTY_FORM, null)
  }

  async function handleEdit(item: BacklogItem) {
    if (!(await confirmDiscard())) return
    openForm(formFromItem(item), item.id)
    setEditingVersion(item.version)
  }

  async function handleSelectIcebox(iceboxId: string) {
    const icebox = data.iceboxOptions.find((i) => i.id === iceboxId)
    if (!iceboxId || !icebox) {
      setForm((prev) => ({ ...prev, iceboxItemId: "" }))
      return
    }
    // Warn when a different PBI already references this IceBox item — the
    // ⚠ tag in the dropdown is easy to miss when picking via keyboard.
    const used = iceboxUsage.get(iceboxId)
    if (used) {
      const ok = await confirm({
        title: t.backlogIceboxAlreadyUsedTitle,
        message: `${t.backlogIceboxAlreadyUsedBody}\n\n→ #${used.displayId} ${used.label}`,
        confirmLabel: t.backlogIceboxReuseAnyway,
        cancelLabel: t.cancel,
        variant: "danger",
      })
      if (!ok) {
        setForm((prev) => ({ ...prev, iceboxItemId: "" }))
        return
      }
    }
    setForm((prev) => ({ ...prev, iceboxItemId: iceboxId, userStory: prev.userStory || icebox.request }))
  }

  async function handleDelete(item: BacklogItem) {
    const ok = await confirm({ message: t.backlogDeleteConfirm, confirmLabel: t.trashMoveToTrash, cancelLabel: t.cancel, variant: "danger" })
    if (ok) void data.remove.mutate(item)
  }

  const q = searchQuery.toLowerCase().trim()
  const visible: Record<BacklogStatus, BacklogItem[]> = useMemo(
    () => ({
      ready: lists.ready.filter((i) => matchesQuery(i, q)),
      not_ready: lists.not_ready.filter((i) => matchesQuery(i, q)),
      completed: lists.completed.filter((i) => matchesQuery(i, q)),
    }),
    [lists, q],
  )

  /**
   * Swap a PBI with its visible neighbour. The swap is applied to the full
   * (unfiltered) list so a search filter never scrambles hidden items.
   */
  function handleMove(item: BacklogItem, direction: -1 | 1) {
    const status = item.status as BacklogStatus
    const shown = visible[status]
    const vIdx = shown.findIndex((i) => i.id === item.id)
    const neighbour = shown[vIdx + direction]
    if (!neighbour) return
    const full = lists[status]
    const ordered = swapped(full, full.findIndex((i) => i.id === item.id), full.findIndex((i) => i.id === neighbour.id))
    void data.reorder.mutate({ status, ordered })
    setAnnouncement(t.backlogMovedAnnounce.replace("{id}", String(item.displayId)).replace("{pos}", String(vIdx + direction + 1)))
    // Keep keyboard focus on the moved item's control after the re-render.
    const target = direction === -1 ? "up" : "down"
    const fallback = direction === -1 ? "down" : "up"
    requestAnimationFrame(() => {
      const btn =
        document.querySelector<HTMLButtonElement>(`[data-reorder="${item.id}:${target}"]:not(:disabled)`) ??
        document.querySelector<HTMLButtonElement>(`[data-reorder="${item.id}:${fallback}"]`)
      btn?.focus()
    })
  }

  // Stable handler identities keep the memoized BacklogItemCard rows from
  // re-rendering on every keystroke in the form / search box.
  const cardHandlers = useStableHandlers({
    onMove: handleMove,
    onStatusChange: (item: BacklogItem, to: BacklogStatus) =>
      void data.changeStatus.mutate({ item, from: item.status as BacklogStatus, to }),
    onEdit: handleEdit,
    onDelete: handleDelete,
    onView: (item: BacklogItem) => setDetailPbiId(item.id),
    onInvest: (item: BacklogItem) => setInvestPbiId(item.id),
  })
  const actions = { canEdit, ...cardHandlers }

  return (
    <div className="mx-auto max-w-5xl">
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <PageHeader
        title={pt.backlogTitle}
        icon={<ClipboardList className="h-7 w-7 text-primary" />}
        description={
          all && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1 text-caption font-medium text-primary-active">
              <Scale className="h-3.5 w-3.5" />
              {t.reportTotalWorkload}: {all.totalWorkload}
            </span>
          )
        }
        actions={
          canEdit && (
            <Button onClick={handleAdd} leftIcon={<Plus className="h-4 w-4" />}>
              {t.backlogAddItem}
            </Button>
          )
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

      {formOpen && (
        <BacklogForm
          form={form}
          setForm={setForm}
          isEditing={editingId !== null}
          canEdit={canEdit}
          saving={save.isPending}
          generating={ai.generating}
          onGenerate={ai.generate}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          onSelectIcebox={handleSelectIcebox}
          iceboxOptions={data.iceboxOptions}
          iceboxUsage={iceboxUsage}
          productGoals={data.goals}
          pointUnit={data.pointUnit}
        />
      )}

      <div className="relative mb-6">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
          <Search className="h-4 w-4 text-fg-subtle" />
        </div>
        <Input
          type="search"
          inputSize="lg"
          aria-label={t.backlogSearchLabel}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={`${pt.backlogInitiative} / ${pt.backlogEpic} / ${pt.backlogUserStory}`}
          className="pl-10 shadow-ui-sm"
        />
      </div>

      {backlog.isLoading ? (
        <div className="space-y-6">
          <SkeletonCard label={t.loading} />
          <SkeletonCard />
        </div>
      ) : !all ? (
        <EmptyState
          title={t.backlogLoadFailed}
          description={backlog.error?.message}
          action={<Button onClick={backlog.refetch}>{t.backlogRetry}</Button>}
        />
      ) : (
        <div className="space-y-6">
          <BacklogSection title={t.backlogSectionReadyTitle} hint={t.backlogReadyHint} status="ready" items={visible.ready} showWorkloadTotal {...actions} />
          <BacklogSection title={t.backlogSectionNotReadyTitle} hint={t.backlogNotReadyHint} status="not_ready" items={visible.not_ready} onAdd={handleAdd} {...actions} />
          <div>
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={showCompleted}
              onClick={() => setShowCompleted((v) => !v)}
              className="mb-2"
              leftIcon={<ChevronDown className={`h-4 w-4 transition-transform ${showCompleted ? "" : "-rotate-90"}`} />}
            >
              {showCompleted ? t.backlogHideCompleted : t.backlogShowCompleted}
              <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-caption text-fg-muted">
                {visible.completed.length}
                {t.items}
              </span>
            </Button>
            {showCompleted && (
              <BacklogSection title={t.backlogStatusCompleted} hint={t.backlogCompletedHint} status="completed" items={visible.completed} {...actions} />
            )}
          </div>
        </div>
      )}

      {detailPbiId && <PbiDetailModal projectId={projectId} pbiId={detailPbiId} onClose={() => setDetailPbiId(null)} />}
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

