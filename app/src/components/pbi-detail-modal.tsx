"use client"

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react"
import { useLanguage } from "@/lib/language-context"
import { AIResultModal } from "@/components/ai-result-modal"
import { PbiDetailTabs } from "@/components/pbi-detail-tabs"
import { useI18nText } from "@/components/i18n-text"
import { Badge, Button, EmptyState, Modal, SkeletonLines, useConfirm, useModalClose, useUiLabels, type BadgeTone } from "@/components/ui"
import { apiFetch, conflictAwareToast, useApiMutation, useApiQuery, useUnsavedChangesGuard, versionConflictOf, withVersion } from "@/hooks"
import { PbiEditFields } from "@/components/pbi-form/pbi-edit-fields"
import { EMPTY_PBI_FORM, buildPbiPatch, isSamePbiForm, toPbiForm, type PbiForm } from "@/components/pbi-form/pbi-form-state"
import { PbiReadBody, type PbiDetail } from "@/components/pbi-form/pbi-read-body"
import { useAiFieldGenerator } from "@/components/pbi-form/use-ai-field-generator"
import { pbiDeepLink, useCopyLink } from "@/components/pbi-form/use-copy-link"
import { usePbiFormOptions, type PbiFormOptions } from "@/components/pbi-form/use-pbi-form-options"
import { Link2, Pencil } from "lucide-react"

interface Props {
  projectId: string
  pbiId: string
  onClose: () => void
  /** When true (viewer is PO/SM/admin — the API rejects others), the read view offers "Edit". */
  editable?: boolean
  /** Called after a successful save so the caller can refresh its data. */
  onSaved?: () => void
  /** Start in edit mode (e.g. the card's pencil). Ignored unless `editable`. Default: read. */
  initialMode?: "read" | "edit"
  /** Form choices the caller already holds (else they are fetched when editing starts). */
  formOptions?: PbiFormOptions
}

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
 * Leaving edit mode, closing, or navigating away with unsaved changes asks
 * first. Saves send the loaded version; a 409 loads the other user's version.
 */
export default function PbiDetailModal({ projectId, pbiId, onClose, editable, onSaved, initialMode, formOptions }: Props) {
  const { t, language } = useLanguage()
  const url = `/api/projects/${projectId}/backlog/${pbiId}`
  const { data: item, error, isLoading, refetch } = useApiQuery<PbiDetail>(url)
  const [showInvest, setShowInvest] = useState(false)
  const [mode, setMode] = useState<"read" | "edit">(initialMode === "edit" ? "edit" : "read")
  const isEditing = !!editable && mode === "edit" && !!item
  const edit = usePbiEditState(item)
  const form = edit.form
  const isDirty = isEditing && !!form && edit.isDirty
  useUnsavedChangesGuard(isDirty)
  const options = usePbiFormOptions(projectId, isEditing, formOptions)
  const ai = useAiFieldGenerator(projectId, form ?? EMPTY_PBI_FORM, edit.setForm)
  const copyLink = useCopyLink()

  const headInitiative = useI18nText(item?.i18n, "initiative", item?.initiative)
  const headUserStory = useI18nText(item?.i18n, "userStory", item?.userStory)
  const headGoal = useI18nText(item?.productGoal?.i18n, "title", item?.productGoal?.title)

  const save = useApiMutation((patch: Record<string, unknown>) => apiFetch(url, { method: "PATCH", json: patch }), {
    onSuccess: () => {
      onSaved?.()
      edit.reset()
      setMode("read")
      refetch()
    },
    // Someone else saved the PBI first: drop the local edits and load theirs.
    onError: (e) => {
      if (!versionConflictOf(e)) return
      edit.reset()
      refetch()
    },
    toastOnError: conflictAwareToast((e) => `${t.backlogSaveFailed}: ${e.message}`),
    toastOnSuccess: t.backlogSaved,
  })

  function handleSave() {
    // Never save while an AI stream is still writing into the form.
    if (!item || !form || save.isPending || ai.generating) return
    const patch = buildPbiPatch(item, form)
    // Raw text is saved as typed; the background worker translates it.
    if (Object.keys(patch).length === 0) {
      edit.reset()
      setMode("read")
    } else void save.mutate(withVersion(patch, item.version))
  }

  const title = headInitiative.text || headUserStory.text || t.backlogDetailTitle

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
          <Footer
            isEditing={isEditing}
            canEdit={!!editable && !!item}
            isDirty={isDirty}
            canInvest={!!item}
            saving={save.isPending}
            generating={ai.generating !== null}
            onInvest={() => setShowInvest(true)}
            onCopyLink={() => item && void copyLink(pbiDeepLink(window.location.origin, projectId, item.displayId))}
            onEdit={() => setMode("edit")}
            onCancelEdit={() => {
              edit.reset()
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
            details={
              isEditing && form ? (
                <PbiEditFields
                  form={form}
                  setForm={edit.setForm}
                  options={options}
                  selfId={item.id}
                  disabled={save.isPending}
                  generating={ai.generating}
                  onGenerate={ai.generate}
                />
              ) : (
                <PbiReadBody item={item} />
              )
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

interface FooterProps {
  isEditing: boolean
  canEdit: boolean
  isDirty: boolean
  canInvest: boolean
  saving: boolean
  generating: boolean
  onInvest: () => void
  onCopyLink: () => void
  onEdit: () => void
  onCancelEdit: () => void
  onSave: () => void
}

function Footer(props: FooterProps) {
  const { t } = useLanguage()
  const ui = useUiLabels()
  const close = useModalClose()
  const confirm = useConfirm()

  // Cancel returns to the read view (not closing the modal); unsaved edits ask first.
  async function cancelEdit() {
    if (props.isDirty) {
      const ok = await confirm({ title: ui.unsavedTitle, message: ui.unsavedMessage, confirmLabel: ui.discard, cancelLabel: t.cancel, variant: "warning" })
      if (!ok) return
    }
    props.onCancelEdit()
  }

  return (
    <>
      <Button variant="secondary" onClick={props.onInvest} disabled={!props.canInvest} className="mr-auto" leftIcon={<span aria-hidden="true">🤖</span>}>
        {t.aiInvestReview}
      </Button>
      {props.isEditing ? (
        <>
          <Button variant="secondary" onClick={() => void cancelEdit()}>
            {t.cancel}
          </Button>
          <Button onClick={props.onSave} loading={props.saving} disabled={props.generating}>
            {t.update}
          </Button>
        </>
      ) : (
        <>
          <Button variant="ghost" onClick={props.onCopyLink} disabled={!props.canInvest} leftIcon={<Link2 className="h-4 w-4" />}>
            {t.backlogCopyLink}
          </Button>
          <Button variant="secondary" onClick={close}>
            {t.close}
          </Button>
          {props.canEdit && (
            <Button onClick={props.onEdit} leftIcon={<Pencil className="h-4 w-4" />}>
              {t.edit}
            </Button>
          )}
        </>
      )}
    </>
  )
}
