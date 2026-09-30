"use client"

import { useState, type FormEvent } from "react"
import { GlossaryHint } from "@/components/i18n-text"
import { Button, Field, Input, Modal, Select, Textarea, useModalClose } from "@/components/ui"
import { apiFetch, conflictAwareToast, useApiMutation, useUnsavedChangesGuard, versionConflictOf, withVersion } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { IceboxAttachmentsEditor } from "./icebox-attachments-editor"
import { editFormFromItem, type IceboxAttachment, type IceboxEditForm, type IceboxItem } from "./types"

interface Props {
  projectId: string
  item: IceboxItem
  onClose: () => void
  /** Refresh the page list (after save or attachment changes). */
  onChanged: () => void
}

const FORM_ID = "icebox-edit-form"

function EditFooter({ saving }: { saving: boolean }) {
  const { t } = useLanguage()
  const close = useModalClose()
  return (
    <>
      <Button variant="secondary" onClick={close}>
        {t.cancel}
      </Button>
      <Button type="submit" form={FORM_ID} loading={saving}>
        {t.update}
      </Button>
    </>
  )
}

function isSameForm(a: IceboxEditForm, b: IceboxEditForm): boolean {
  return (Object.keys(a) as (keyof IceboxEditForm)[]).every((k) => a[k] === b[k])
}

/** Edit dialog for an IceBox item. Unsaved text edits ask before closing. */
export function IceboxEditModal({ projectId, item, onClose, onChanged }: Props) {
  const { t, pt } = useLanguage()
  const [initial] = useState(() => editFormFromItem(item))
  const [form, setForm] = useState<IceboxEditForm>(initial)
  const [attachments, setAttachments] = useState<IceboxAttachment[]>(item.attachments ?? [])
  const isDirty = !isSameForm(form, initial)
  useUnsavedChangesGuard(isDirty)

  const save = useApiMutation(
    (f: IceboxEditForm) =>
      apiFetch(`/api/projects/${projectId}/icebox/${item.id}`, {
        method: "PATCH",
        json: withVersion({
          author: f.author || undefined,
          request: f.request,
          background: f.background || null,
          status: f.status,
          poHearingMemo: f.poHearingMemo || null,
          poReviewMemo: f.poReviewMemo || null,
          freezeReason: f.freezeReason || null,
        }, item.version),
      }),
    {
      onSuccess: () => {
        onChanged()
        onClose()
      },
      // Someone else saved the item first: reload the list and close; reopening shows theirs.
      onError: (e) => {
        if (!versionConflictOf(e)) return
        onChanged()
        onClose()
      },
      toastOnError: conflictAwareToast((e) => `${t.iceboxSaveFailed}: ${e.message}`),
      toastOnSuccess: t.iceboxSaved,
    },
  )

  function update<K extends keyof IceboxEditForm>(key: K, value: IceboxEditForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!save.isPending) void save.mutate(form)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t.iceboxEditTitle}
      description={`#${item.displayId}`}
      size="md"
      isDirty={isDirty && !save.isPending}
      footer={<EditFooter saving={save.isPending} />}
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4">
        <Field label={t.sprintAssignee}>
          <Input value={form.author} onChange={(e) => update("author", e.target.value)} maxLength={200} />
        </Field>
        <Field label={pt.iceboxRequest} required>
          <Textarea value={form.request} onChange={(e) => update("request", e.target.value)} required rows={3} />
        </Field>
        <GlossaryHint className="-mt-2" />
        <Field label={pt.iceboxBackground}>
          <Textarea value={form.background} onChange={(e) => update("background", e.target.value)} rows={2} />
        </Field>

        <IceboxAttachmentsEditor
          projectId={projectId}
          itemId={item.id}
          attachments={attachments}
          onChange={setAttachments}
          onServerChange={onChanged}
        />

        <Field label={t.iceboxStatus}>
          <Select value={form.status} onChange={(e) => update("status", e.target.value)}>
            <option value="unreviewed">{t.iceboxStatusUnreviewed}</option>
            <option value="reviewed">{t.iceboxStatusReviewed}</option>
            <option value="completed">{t.iceboxStatusCompleted}</option>
            <option value="frozen">{t.iceboxStatusFrozen}</option>
          </Select>
        </Field>
        <Field label={t.iceboxPoHearingMemo}>
          <Textarea value={form.poHearingMemo} onChange={(e) => update("poHearingMemo", e.target.value)} rows={2} />
        </Field>
        <Field label={t.iceboxPoReviewMemo}>
          <Textarea value={form.poReviewMemo} onChange={(e) => update("poReviewMemo", e.target.value)} rows={2} />
        </Field>
        {form.status === "frozen" && (
          <Field label={t.iceboxFreezeReason}>
            <Textarea value={form.freezeReason} onChange={(e) => update("freezeReason", e.target.value)} rows={2} />
          </Field>
        )}
      </form>
    </Modal>
  )
}
