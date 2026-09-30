"use client"

import { useState } from "react"
import { useLanguage } from "@/lib/language-context"
import { AIResultModal } from "@/components/ai-result-modal"
import { PbiDetailTabs } from "@/components/pbi-detail-tabs"
import { GlossaryHint, I18nText, useI18nText } from "@/components/i18n-text"
import { Badge, Button, EmptyState, Field, Input, Modal, Select, SkeletonLines, Textarea, useModalClose, type BadgeTone } from "@/components/ui"
import { apiFetch, conflictAwareToast, useApiMutation, useApiQuery, useUnsavedChangesGuard, versionConflictOf, withVersion } from "@/hooks"
import type { EntityI18n } from "@/lib/translation/types"
import type { BacklogItemDetailDto } from "@/types/api"

type PbiDetail = Omit<BacklogItemDetailDto, "iceboxItemId" | "productGoalId">

interface Props {
  projectId: string
  pbiId: string
  onClose: () => void
  /** When true and the viewer has rights, fields become editable. */
  editable?: boolean
  /** Called after a successful save so the caller can refresh its data. */
  onSaved?: () => void
}

const STATUS_TONE: Record<string, BadgeTone> = {
  not_ready: "warning",
  ready: "primary",
  completed: "success",
}

interface PbiForm {
  initiative: string
  epic: string
  userStory: string
  acceptanceCriteria: string
  workloadScore: string
  assignedPo: string
  status: string
  poNote: string
  notReadyReason: string
  referenceDoc: string
}

function toFormState(p: PbiDetail): PbiForm {
  return {
    initiative: p.initiative ?? "",
    epic: p.epic ?? "",
    userStory: p.userStory ?? "",
    acceptanceCriteria: p.acceptanceCriteria ?? "",
    workloadScore: p.workloadScore != null ? String(p.workloadScore) : "",
    assignedPo: p.assignedPo ?? "",
    status: p.status,
    poNote: p.poNote ?? "",
    notReadyReason: p.notReadyReason ?? "",
    referenceDoc: p.referenceDoc ?? "",
  }
}

/** Only the fields that differ from the loaded PBI (empty strings become null). */
function buildPatch(item: PbiDetail, form: PbiForm): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  const text: (keyof PbiForm & keyof PbiDetail)[] = [
    "initiative", "epic", "userStory", "acceptanceCriteria", "assignedPo", "poNote", "notReadyReason", "referenceDoc",
  ]
  for (const key of text) {
    if (form[key] !== ((item[key] as string | null) ?? "")) patch[key] = form[key] || null
  }
  const ws = form.workloadScore.trim() === "" ? null : parseInt(form.workloadScore, 10)
  if (ws !== item.workloadScore) patch.workloadScore = ws
  if (form.status !== item.status) patch.status = form.status
  return patch
}

function isSameForm(a: PbiForm, b: PbiForm): boolean {
  return (Object.keys(a) as (keyof PbiForm)[]).every((k) => a[k] === b[k])
}

/**
 * Centered modal showing the full details of a Product Backlog Item. When
 * `editable=true` and the viewer is a PO/SM/admin (the underlying API will
 * reject otherwise), every field becomes editable and the footer gains a
 * Save button; closing with unsaved edits asks first.
 */
export default function PbiDetailModal({ projectId, pbiId, onClose, editable, onSaved }: Props) {
  const { t, language } = useLanguage()
  const url = `/api/projects/${projectId}/backlog/${pbiId}`
  const { data: item, error, isLoading, refetch } = useApiQuery<PbiDetail>(url)
  const [showInvest, setShowInvest] = useState(false)
  // Edits are stored against the PBI they were made for, so a late response
  // for another PBI can never be mixed with them.
  const [draft, setDraft] = useState<{ id: string; form: PbiForm } | null>(null)
  const baseline = item ? toFormState(item) : null
  const form = draft && item && draft.id === item.id ? draft.form : baseline
  const isEditing = !!editable && !!form && !!item
  const isDirty = isEditing && !!baseline && !!form && !isSameForm(form, baseline)
  useUnsavedChangesGuard(isDirty)

  const headInitiative = useI18nText(item?.i18n, "initiative", item?.initiative)
  const headUserStory = useI18nText(item?.i18n, "userStory", item?.userStory)
  const headGoal = useI18nText(item?.productGoal?.i18n, "title", item?.productGoal?.title)

  const save = useApiMutation(
    (patch: Record<string, unknown>) => apiFetch(url, { method: "PATCH", json: patch }),
    {
      onSuccess: () => {
        onSaved?.()
        onClose()
      },
      // Someone else saved the PBI first: drop the local edits and load theirs.
      onError: (e) => {
        if (!versionConflictOf(e)) return
        setDraft(null)
        refetch()
      },
      toastOnError: conflictAwareToast((e) => `${t.backlogSaveFailed}: ${e.message}`),
      toastOnSuccess: t.backlogSaved,
    },
  )

  function setForm(next: PbiForm) {
    if (item) setDraft({ id: item.id, form: next })
  }

  function handleSave() {
    if (!item || !form || save.isPending) return
    const patch = buildPatch(item, form)
    // Raw text is saved as typed; the background worker translates it.
    if (Object.keys(patch).length === 0) onClose()
    else void save.mutate(withVersion(patch, item.version))
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
            canInvest={!!item}
            saving={save.isPending}
            onInvest={() => setShowInvest(true)}
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
            details={isEditing && form ? <EditBody form={form} setForm={setForm} /> : <ReadBody item={item} />}
          />
        )}
      </Modal>
      {showInvest && item && (
        <AIResultModal
          title={t.aiInvestTitle}
          fetchUrl={`${url}/ai/invest-review`}
          fetchBody={{ lang: language }}
          onClose={() => setShowInvest(false)}
        />
      )}
    </>
  )
}

type T = ReturnType<typeof useLanguage>["t"]

function statusLabel(status: string, t: T): string {
  if (status === "ready") return t.backlogStatusReady
  if (status === "not_ready") return t.backlogStatusNotReady
  if (status === "completed") return t.backlogStatusCompleted
  return status
}

interface FooterProps {
  isEditing: boolean
  canInvest: boolean
  saving: boolean
  onInvest: () => void
  onSave: () => void
}

function Footer({ isEditing, canInvest, saving, onInvest, onSave }: FooterProps) {
  const { t } = useLanguage()
  const close = useModalClose()
  return (
    <>
      <Button variant="secondary" onClick={onInvest} disabled={!canInvest} className="mr-auto" leftIcon={<span aria-hidden="true">🤖</span>}>
        {t.aiInvestReview}
      </Button>
      <Button variant="secondary" onClick={close}>
        {isEditing ? t.cancel : t.close}
      </Button>
      {isEditing && (
        <Button onClick={onSave} loading={saving}>
          {t.update}
        </Button>
      )}
    </>
  )
}

function EditBody({ form, setForm }: { form: PbiForm; setForm: (f: PbiForm) => void }) {
  const { t, pt } = useLanguage()
  const set = <K extends keyof PbiForm>(key: K) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value })
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label={pt.backlogInitiative}>
          <Input value={form.initiative} onChange={set("initiative")} />
        </Field>
        <Field label={pt.backlogEpic}>
          <Input value={form.epic} onChange={set("epic")} />
        </Field>
      </div>
      <Field label={pt.backlogUserStory}>
        <Textarea value={form.userStory} onChange={set("userStory")} rows={5} className="resize-y" />
      </Field>
      <GlossaryHint />
      <Field label={pt.backlogAcceptanceCriteria}>
        <Textarea
          value={form.acceptanceCriteria}
          onChange={set("acceptanceCriteria")}
          rows={7}
          placeholder={t.backlogAcceptanceCriteriaPlaceholder}
          className="min-h-[160px] resize-y"
        />
      </Field>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field label={pt.backlogWorkloadScore}>
          <Input type="number" min={0} step={1} value={form.workloadScore} onChange={set("workloadScore")} />
        </Field>
        <Field label={pt.rolePO}>
          <Input value={form.assignedPo} onChange={set("assignedPo")} />
        </Field>
        <Field label={t.sprintStatus}>
          <Select value={form.status} onChange={set("status")}>
            <option value="not_ready">{t.backlogStatusNotReady}</option>
            <option value="ready">{t.backlogStatusReady}</option>
            <option value="completed">{t.backlogStatusCompleted}</option>
          </Select>
        </Field>
      </div>
      <Field label={t.backlogPoNote}>
        <Textarea value={form.poNote} onChange={set("poNote")} rows={2} />
      </Field>
      {form.status === "not_ready" && (
        <Field label={t.backlogNotReadyReason}>
          <Textarea value={form.notReadyReason} onChange={set("notReadyReason")} rows={2} />
        </Field>
      )}
      <Field label={t.backlogReferenceDoc}>
        <Textarea value={form.referenceDoc} onChange={set("referenceDoc")} rows={2} />
      </Field>
    </div>
  )
}

function ReadBody({ item }: { item: PbiDetail }) {
  const { t, pt } = useLanguage()
  const headIcebox = useI18nText(item.iceboxItem?.i18n, "request", item.iceboxItem?.request)
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ReadField label={pt.backlogInitiative} value={item.initiative} i18n={item.i18n} field="initiative" entityId={item.id} />
        <ReadField label={pt.backlogEpic} value={item.epic} i18n={item.i18n} field="epic" entityId={item.id} />
      </div>
      <ReadField label={pt.backlogUserStory} value={item.userStory} multiline i18n={item.i18n} field="userStory" entityId={item.id} />
      <ReadField label={pt.backlogAcceptanceCriteria} value={item.acceptanceCriteria} multiline i18n={item.i18n} field="acceptanceCriteria" entityId={item.id} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <ReadField label={pt.backlogWorkloadScore} value={item.workloadScore != null ? String(item.workloadScore) : null} />
        <ReadField label={pt.rolePO} value={item.assignedPo} />
        {item.iceboxItem && <ReadField label={pt.iceboxTitle} value={`#${item.iceboxItem.displayId} ${headIcebox.text}`} />}
      </div>
      <ReadField label={t.backlogPoNote} value={item.poNote} multiline i18n={item.i18n} field="poNote" entityId={item.id} />
      {item.status === "not_ready" && item.notReadyReason && (
        <ReadField label={t.backlogNotReadyReason} value={item.notReadyReason} multiline i18n={item.i18n} field="notReadyReason" entityId={item.id} />
      )}
      <ReadField label={t.backlogReferenceDoc} value={item.referenceDoc} multiline />
    </div>
  )
}

interface ReadFieldProps {
  label: string
  value: string | null
  multiline?: boolean
  /** When given, the viewer-locale side is shown (with a pending badge until translated). */
  i18n?: EntityI18n
  field?: string
  entityId?: string
}

function ReadField({ label, value, multiline, i18n, field, entityId }: ReadFieldProps) {
  const hasValue = !!(value && value.trim())
  const cls = `text-body text-fg ${multiline ? "whitespace-pre-wrap leading-relaxed" : ""} bg-surface-muted rounded-ui-md px-3 py-2 min-h-[38px] break-words`
  return (
    <div>
      <p className="mb-1 text-caption font-medium text-fg-muted">{label}</p>
      <div>
        {!hasValue ? (
          <p className="min-h-[38px] rounded-ui-md bg-surface-muted px-3 py-2 text-body text-fg-subtle">—</p>
        ) : field ? (
          <I18nText
            as="p"
            i18n={i18n}
            field={field}
            original={value}
            entity={entityId ? { type: "backlog_item", id: entityId } : undefined}
            className={cls}
          />
        ) : (
          <p className={cls}>{value}</p>
        )}
      </div>
    </div>
  )
}
