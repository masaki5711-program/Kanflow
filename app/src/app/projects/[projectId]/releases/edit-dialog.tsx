"use client"

import { useState, type FormEvent } from "react"
import { Button, Field, Input, Modal, Select, Textarea, useModalClose } from "@/components/ui"
import { HelpTooltip } from "@/components/help-tooltip"
import { GlossaryHint } from "@/components/i18n-text"
import { useLanguage } from "@/lib/language-context"
import { RELEASE_STATUSES, toEditForm, type ReleaseEditForm, type ReleaseItem } from "./release-types"

const FORM_ID = "release-edit-form"

interface EditDialogProps {
  item: ReleaseItem | null
  saving: boolean
  deleting: boolean
  onClose: () => void
  /** Resolves true on success (the dialog then closes). */
  onSave: (id: string, form: ReleaseEditForm) => Promise<boolean>
  onDelete: (id: string) => void
}

/** Mounted per item (keyed by id) so the form state is initialised from the item. */
export function EditDialog(props: EditDialogProps) {
  if (!props.item) return null
  return <EditDialogBody key={props.item.id} {...props} item={props.item} />
}

function EditDialogBody({ item, saving, deleting, onClose, onSave, onDelete }: EditDialogProps & { item: ReleaseItem }) {
  const { t, pt } = useLanguage()
  const [initial] = useState(() => toEditForm(item))
  const [form, setForm] = useState<ReleaseEditForm>(initial)
  const isDirty = JSON.stringify(form) !== JSON.stringify(initial)

  const set = <K extends keyof ReleaseEditForm>(key: K, value: ReleaseEditForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))
  const text = (key: keyof ReleaseEditForm) => (value: string) => set(key, value || null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (saving) return
    if (await onSave(item.id, form)) onClose()
  }

  const statusLabel: Record<string, string> = {
    staged: pt.releaseStatusStaged,
    ready: pt.releaseStatusReady,
    released: pt.releaseStatusReleased,
    deferred: pt.releaseStatusDeferred,
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={pt.releaseEditTitle}
      description={item.pbItem ? `PBI #${item.pbItem.displayId}` : undefined}
      isDirty={isDirty}
      footer={
        <EditFooter saving={saving} deleting={deleting} onDelete={() => onDelete(item.id)} />
      }
    >
      <form id={FORM_ID} onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={`${pt.releaseVersion}${t.releasePlanSuffix}`}>
            <Input value={form.planVersion ?? ""} onChange={(e) => text("planVersion")(e.target.value)} />
          </Field>
          <Field label={`${pt.releaseVersion}${t.releaseActualSuffix}`}>
            <Input value={form.releaseVersion ?? ""} onChange={(e) => text("releaseVersion")(e.target.value)} />
          </Field>
          <Field label={pt.releaseDate}>
            <Input
              type="date"
              value={form.releaseDate ? form.releaseDate.slice(0, 10) : ""}
              onChange={(e) => text("releaseDate")(e.target.value)}
            />
          </Field>
          <Field label={t.sprintStatus}>
            <Select value={form.status} onChange={(e) => set("status", e.target.value)}>
              {RELEASE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={
              <span className="inline-flex items-center gap-1.5">
                {pt.backlogInitiative}
                <HelpTooltip content={pt.backlogInitiativeHelp} ariaLabel={pt.backlogInitiative} side="right" />
              </span>
            }
          >
            <Input value={form.initiative ?? ""} onChange={(e) => text("initiative")(e.target.value)} />
          </Field>
          <Field
            label={
              <span className="inline-flex items-center gap-1.5">
                {pt.backlogEpic}
                <HelpTooltip content={pt.backlogEpicHelp} ariaLabel={pt.backlogEpic} side="right" />
              </span>
            }
          >
            <Input value={form.epic ?? ""} onChange={(e) => text("epic")(e.target.value)} />
          </Field>
        </div>
        <Field label={pt.rolePO}>
          <Input value={form.assignedPo ?? ""} onChange={(e) => text("assignedPo")(e.target.value)} />
        </Field>
        <div>
          <Field label={pt.releaseNote}>
            <Textarea
              rows={3}
              value={form.releaseNote ?? ""}
              onChange={(e) => text("releaseNote")(e.target.value)}
              className="resize-none"
            />
          </Field>
          <GlossaryHint className="mt-1" />
        </div>
        <Field label={pt.releaseManualLink}>
          <Input
            value={form.manualLink ?? ""}
            onChange={(e) => text("manualLink")(e.target.value)}
            placeholder="https://..."
          />
        </Field>
        <Field label={pt.releasePoNote}>
          <Textarea
            rows={2}
            value={form.poNote ?? ""}
            onChange={(e) => text("poNote")(e.target.value)}
            className="resize-none"
          />
        </Field>
      </form>
    </Modal>
  )
}

interface EditFooterProps {
  saving: boolean
  deleting: boolean
  onDelete: () => void
}

function EditFooter({ saving, deleting, onDelete }: EditFooterProps) {
  const { t } = useLanguage()
  const close = useModalClose()
  return (
    <div className="flex w-full items-center justify-between gap-3">
      <Button variant="danger" onClick={onDelete} loading={deleting}>
        {t.delete}
      </Button>
      <div className="flex gap-3">
        <Button variant="secondary" onClick={close}>
          {t.cancel}
        </Button>
        <Button type="submit" form={FORM_ID} loading={saving}>
          {t.save}
        </Button>
      </div>
    </div>
  )
}
