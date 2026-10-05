"use client"

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react"
import { useLanguage } from "@/lib/language-context"
import { AIResultModal } from "@/components/ai-result-modal"
import { PbiDetailTabs, formatPbiValue, pbiFieldLabels, type PbiTabKey } from "@/components/pbi-detail-tabs"
import { useI18nText } from "@/components/i18n-text"
import { Badge, Button, EmptyState, Modal, SkeletonLines, useConfirm, useToast, useUiLabels, type BadgeTone } from "@/components/ui"
import { apiFetch, useApiMutation, useApiQuery, useUnsavedChangesGuard, withVersion } from "@/hooks"
import { useBackNavigationGuard } from "@/hooks/use-back-navigation-guard"
import { reapplyEdits, useConflictRebase } from "@/hooks/version-conflict"
import { VersionConflictNotice } from "@/components/version-conflict-notice"
import { PbiDetailFooter } from "@/components/pbi-form/pbi-detail-footer"
import { PbiEditFields } from "@/components/pbi-form/pbi-edit-fields"
import { EMPTY_PBI_FORM, buildPbiPatch, hasPbiFormContent, isSamePbiForm, toPbiForm, type PbiForm } from "@/components/pbi-form/pbi-form-state"
import { PbiReadBody, type PbiDetail } from "@/components/pbi-form/pbi-read-body"
import { useAiFieldGenerator } from "@/components/pbi-form/use-ai-field-generator"
import { pbiDeepLink, useCopyLink } from "@/components/pbi-form/use-copy-link"
import { usePbiFormOptions, type PbiFormOptions } from "@/components/pbi-form/use-pbi-form-options"
import { useSavedPbiAttachments } from "@/components/pbi-form/attachments/use-saved-pbi-attachments"
import type { PbiAttachmentDto } from "@/types/api"
import { PbiDependencySection } from "@/components/pbi-dependencies/pbi-dependency-section"
import { PbiDevPanel } from "@/components/git-dev/pbi-dev-panel"

interface Props {
  projectId: string
  pbiId: string
  onClose: () => void
  /** When true (viewer is PO/SM/admin — the API rejects others), the read view offers "Edit". */
  editable?: boolean
  /** ai.use: offer the INVEST review (default true; the backlog page passes the viewer's permission). */
  canInvest?: boolean
  /** Called after a successful save so the caller can refresh its data. */
  onSaved?: () => void
  /** Start in edit mode (e.g. the card's pencil). Ignored unless `editable`. Default: read. */
  initialMode?: "read" | "edit"
  /** Tab to open on (`?tab=comments` from mention / comment notifications). Default: details. */
  initialTab?: PbiTabKey
  /** Form choices the caller already holds (else they are fetched when editing starts). */
  formOptions?: PbiFormOptions
  /** Open another PBI by its number (dependency rows become links when given). */
  onOpenPbi?: (displayId: number) => void
}

const NO_ATTACHMENTS: readonly PbiAttachmentDto[] = []

const STATUS_TONE: Record<string, BadgeTone> = {
  not_ready: "warning",
  ready: "primary",
  completed: "success",
}

type T = ReturnType<typeof useLanguage>["t"]

function statusLabel(status: string, t: T): string {
  if (status === "ready") return t.backlogStatusReady
  if (status === "not_ready") return t.backlogStatusNotReady
  if (status === "completed") return t.backlogStatusCompleted
  return status
}

/**
 * The one place a PBI is viewed and edited. Opens read-only (Details /
 * Comments / History tabs); "Edit" switches the Details tab to the form.
 * Leaving edit mode, closing, browser Back or leaving the page with unsaved
 * changes asks first. Saves send the loaded version; a 409 loads the other
 * user's version into the form and lists the user's overwritten input.
 */
export default function PbiDetailModal(props: Props) {
  const { projectId, pbiId, onClose, editable, canInvest = true, onSaved, initialMode, initialTab, formOptions, onOpenPbi } = props
  const { t, pt, language } = useLanguage()
  const ui = useUiLabels()
  const confirm = useConfirm()
  const toast = useToast()
  const url = `/api/projects/${projectId}/backlog/${pbiId}`
  const { data: item, error, isLoading, refetch, mutate } = useApiQuery<PbiDetail>(url)
  const [showInvest, setShowInvest] = useState(false)
  const [mode, setMode] = useState<"read" | "edit">(initialMode === "edit" ? "edit" : "read")
  const isEditing = !!editable && mode === "edit" && !!item
  const edit = usePbiEditState(item)
  const form = edit.form
  const isDirty = isEditing && !!form && edit.isDirty
  useUnsavedChangesGuard(isDirty)
  useBackNavigationGuard(isDirty, () =>
    confirm({ title: ui.unsavedTitle, message: ui.unsavedMessage, confirmLabel: ui.discard, cancelLabel: t.cancel, variant: "warning" }),
  )
  const options = usePbiFormOptions(projectId, isEditing, formOptions)
  const ai = useAiFieldGenerator(projectId, form ?? EMPTY_PBI_FORM, edit.setForm)
  const copyLink = useCopyLink()
  // Attachment uploads / deletes apply at once (no version bump): patch the loaded PBI in place.
  const patchAttachments = useCallback(
    (update: (prev: readonly PbiAttachmentDto[]) => PbiAttachmentDto[]) =>
      mutate((prev) => (prev ? { ...prev, attachments: update(prev.attachments ?? []) } : prev)),
    [mutate],
  )
  const attachments = useSavedPbiAttachments({ projectId, itemId: pbiId, attachments: item?.attachments ?? NO_ATTACHMENTS, onChange: patchAttachments })
  const conflict = useConflictRebase<PbiForm>()
  // What the pending save started from (for the conflict's "your input" list).
  const savingRef = useRef<{ base: PbiForm; mine: PbiForm } | null>(null)

  const headInitiative = useI18nText(item?.i18n, "initiative", item?.initiative)
  const headUserStory = useI18nText(item?.i18n, "userStory", item?.userStory)
  const headGoal = useI18nText(item?.productGoal?.i18n, "title", item?.productGoal?.title)

  const save = useApiMutation((patch: Record<string, unknown>) => apiFetch(url, { method: "PATCH", json: patch }), {
    onSuccess: () => {
      onSaved?.()
      edit.reset()
      conflict.dismiss()
      setMode("read")
      refetch()
    },
    // Someone else saved first: load their version into the form (a second
    // save then sends the new version) and keep the user's input visible.
    onError: (e) => {
      const pending = savingRef.current
      const handled =
        !!pending &&
        conflict.rebase<PbiDetail>(e, {
          ...pending,
          onConflict: (current) => {
            edit.reset()
            if (!current) {
              refetch()
              return null
            }
            mutate(current)
            return toPbiForm(current)
          },
        })
      if (!handled) toast.error(`${t.backlogSaveFailed}: ${e.message}`)
    },
    toastOnSuccess: t.backlogSaved,
  })

  // Same rule as create (N-01): a PBI keeps an initiative or a user story.
  const hasContent = !form || hasPbiFormContent(form)
  const contentMessage = t.backlogContentRequired.replace("{story}", pt.backlogUserStory).replace("{initiative}", pt.backlogInitiative)

  function handleSave() {
    // Never save while an AI stream is still writing into the form, nor an untitled PBI.
    if (!item || !form || save.isPending || ai.generating || !hasContent) return
    const patch = buildPbiPatch(item, form)
    // Raw text is saved as typed; the background worker translates it.
    if (Object.keys(patch).length === 0) {
      edit.reset()
      conflict.dismiss()
      setMode("read")
      return
    }
    savingRef.current = { base: toPbiForm(item), mine: form }
    void save.mutate(withVersion(patch, item.version))
  }

  function restoreMine() {
    if (!item || !conflict.lost) return
    edit.setForm(reapplyEdits(toPbiForm(item), conflict.lost))
    conflict.dismiss()
  }

  const title = headInitiative.text || headUserStory.text || t.backlogDetailTitle
  const labels = { ...pbiFieldLabels(t, pt), planItemId: t.planPbiField }

  return (
    <>
      <Modal
        open
        onClose={onClose}
        size="xl"
        // Read-only detail view closes on backdrop click; never while editing.
        closeOnOverlayClick={!isEditing}
        title={title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">#{item?.displayId ?? "—"}</span>
            {item && !isEditing && (
              <Badge tone={STATUS_TONE[item.status] ?? "neutral"} size="sm">
                {statusLabel(item.status, t)}
              </Badge>
            )}
            {item?.productGoal?.title && <span className="text-indigo-700">→ {headGoal.text}</span>}
          </span>
        }
        isDirty={isDirty && !save.isPending}
        footer={
          <PbiDetailFooter
            isEditing={isEditing}
            canEdit={!!editable && !!item}
            isDirty={isDirty}
            isLoaded={!!item}
            isMissing={!isLoading && !item}
            canInvest={canInvest}
            canSave={hasContent}
            saving={save.isPending}
            generating={ai.generating !== null}
            onInvest={() => setShowInvest(true)}
            onCopyLink={() => item && void copyLink(pbiDeepLink(window.location.origin, projectId, item.displayId))}
            onEdit={() => setMode("edit")}
            onCancelEdit={() => {
              edit.reset()
              conflict.dismiss()
              setMode("read")
            }}
            onSave={handleSave}
          />
        }
      >
        {isLoading ? (
          <SkeletonLines lines={6} label={t.loading} />
        ) : !item ? (
          <EmptyState
            compact
            title={t.error}
            description={error?.message}
            action={<Button variant="secondary" onClick={refetch}>{t.backlogRetry}</Button>}
          />
        ) : (
          <PbiDetailTabs
            projectId={projectId}
            pbiId={item.id}
            initialTab={initialTab}
            details={
              <div className="space-y-5">
                {isEditing && form ? (
                  <div className="space-y-4">
                    {conflict.lost && (
                      <VersionConflictNotice
                        lost={conflict.lost}
                        labels={labels}
                        formatValue={(f, v) => (f === "planItemId" ? (v ? t.historyChanged : "") : formatPbiValue(t, f, v as string))}
                        onRestore={restoreMine}
                        onDismiss={conflict.dismiss}
                      />
                    )}
                    <PbiEditFields
                      form={form}
                      setForm={edit.setForm}
                      options={options}
                      selfId={item.id}
                      projectId={projectId}
                      disabled={save.isPending}
                      generating={ai.generating}
                      onGenerate={ai.generate}
                      contentError={hasContent ? undefined : contentMessage}
                      attachments={attachments}
                    />
                  </div>
                ) : (
                  <PbiReadBody item={item} projectId={projectId} />
                )}
                {/* Dependency writes apply immediately (no version bump), in read and edit mode alike. */}
                <PbiDependencySection
                  projectId={projectId}
                  item={item}
                  label={`#${item.displayId} ${title}`}
                  canEdit={!!editable}
                  onChanged={() => {
                    refetch()
                    onSaved?.()
                  }}
                  onOpenRef={onOpenPbi && !isDirty ? (ref) => onOpenPbi(ref.displayId) : undefined}
                />
                {/* GitLab development info (renders nothing when the project has Git off). */}
                {!isEditing && <PbiDevPanel projectId={projectId} pbiId={item.id} />}
              </div>
            }
          />
        )}
      </Modal>
      {showInvest && item && (
        <AIResultModal title={t.aiInvestTitle} fetchUrl={`${url}/ai/invest-review`} fetchBody={{ lang: language }} onClose={() => setShowInvest(false)} />
      )}
    </>
  )
}

/**
 * Edit draft of the loaded PBI. The draft is stored against the PBI id it was
 * made for, so a late response for another PBI can never be mixed with it;
 * until the first edit the form mirrors the loaded row.
 */
function usePbiEditState(item: PbiDetail | null | undefined) {
  const [draft, setDraft] = useState<{ id: string; form: PbiForm } | null>(null)
  const itemRef = useRef(item)
  useEffect(() => {
    itemRef.current = item
  })
  const baseline = item ? toPbiForm(item) : null
  const form = draft && item && draft.id === item.id ? draft.form : baseline
  const setForm: Dispatch<SetStateAction<PbiForm>> = useCallback((update) => {
    setDraft((prev) => {
      const current = itemRef.current
      if (!current) return prev
      const base = prev && prev.id === current.id ? prev.form : toPbiForm(current)
      return { id: current.id, form: typeof update === "function" ? update(base) : update }
    })
  }, [])
  const reset = useCallback(() => setDraft(null), [])
  return { form, setForm, reset, isDirty: !!form && !!baseline && !isSamePbiForm(form, baseline) }
}
