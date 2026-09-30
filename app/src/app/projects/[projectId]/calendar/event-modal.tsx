"use client"

import { useState } from "react"
import { Button, Field, Input, Modal, Select, Textarea, cn, useModalClose } from "@/components/ui"
import { GlossaryHint } from "@/components/i18n-text"
import { useLanguage } from "@/lib/language-context"
import { pickText } from "@/lib/translation/pick-text"
import { type EventFormState, type Sprint, EVENT_COLORS, eventColorDot, i18nOf } from "./calendar-types"

const FORM_ID = "calendar-event-form"

export interface EventModalProps {
  open: boolean
  editingEventId: string | null
  /** Initial values; remount (change `key`) to reset. */
  initialForm: EventFormState
  sprints: Sprint[]
  saving: boolean
  deleting: boolean
  onSave: (form: EventFormState) => void
  onDelete: () => void
  onClose: () => void
}

function isSameForm(a: EventFormState, b: EventFormState): boolean {
  return (Object.keys(a) as (keyof EventFormState)[]).every((k) => a[k] === b[k])
}

export default function EventModal({
  open,
  editingEventId,
  initialForm,
  sprints,
  saving,
  deleting,
  onSave,
  onDelete,
  onClose,
}: EventModalProps) {
  const { t, language } = useLanguage()
  const [form, setForm] = useState<EventFormState>(initialForm)
  const [submitted, setSubmitted] = useState(false)
  const update = (patch: Partial<EventFormState>) => setForm((f) => ({ ...f, ...patch }))

  const titleError = submitted && !form.title.trim() ? t.calendarTitleRequired : undefined
  const endError = form.endDate && form.date && form.endDate < form.date ? t.calendarEndBeforeStart : undefined

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (!form.title.trim() || !form.date || endError) return
    onSave(form)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editingEventId ? t.eventEdit : t.eventAdd}
      isDirty={!isSameForm(form, initialForm)}
      footer={
        <EventModalFooter
          isEditing={!!editingEventId}
          saving={saving}
          deleting={deleting}
          onDelete={onDelete}
        />
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} noValidate className="space-y-4">
        <Field label={t.eventTitle} required error={titleError}>
          <Input
            data-autofocus
            value={form.title}
            onChange={(e) => update({ title: e.target.value })}
            placeholder={t.eventTitlePlaceholder}
          />
        </Field>

        <div>
          <Field label={t.eventDescription}>
            <Textarea
              value={form.description}
              onChange={(e) => update({ description: e.target.value })}
              rows={2}
              placeholder={t.eventDescriptionPlaceholder}
              className="resize-none"
            />
          </Field>
          <GlossaryHint className="mt-1" />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t.eventStartDate} required>
            <Input type="date" value={form.date} onChange={(e) => update({ date: e.target.value })} />
          </Field>
          <Field label={t.eventEndDate} error={endError}>
            <Input
              type="date"
              value={form.endDate}
              min={form.date || undefined}
              onChange={(e) => update({ endDate: e.target.value })}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <fieldset>
            <legend className="mb-2 text-body font-medium text-fg">{t.eventColor}</legend>
            <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label={t.eventColor}>
              {EVENT_COLORS.map((c) => {
                const selected = form.color === c
                return (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={t.calendarColorNames[c]}
                    title={t.calendarColorNames[c]}
                    onClick={() => update({ color: c })}
                    className={cn(
                      "w-7 h-7 rounded-full relative",
                      eventColorDot[c],
                      selected ? "ring-2 ring-offset-2 ring-fg-muted" : "hover:opacity-90",
                    )}
                  >
                    {selected && (
                      <svg
                        className="w-3.5 h-3.5 text-white absolute inset-0 m-auto"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <Field label={t.eventSprintLink}>
            <Select value={form.sprintId} onChange={(e) => update({ sprintId: e.target.value })}>
              <option value="">-- {t.eventNone} --</option>
              {sprints.map((s) => (
                <option key={s.id} value={s.id}>
                  {pickText(i18nOf(s), "sprintName", s.sprintName, language).text}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </form>
    </Modal>
  )
}

function EventModalFooter({
  isEditing,
  saving,
  deleting,
  onDelete,
}: {
  isEditing: boolean
  saving: boolean
  deleting: boolean
  onDelete: () => void
}) {
  const { t } = useLanguage()
  const close = useModalClose()
  return (
    <div className="flex w-full items-center gap-3">
      {isEditing && (
        <Button variant="danger" onClick={onDelete} loading={deleting} disabled={saving}>
          {t.delete}
        </Button>
      )}
      <div className="ml-auto flex gap-2">
        <Button variant="secondary" onClick={close}>
          {t.cancel}
        </Button>
        <Button type="submit" form={FORM_ID} loading={saving} disabled={deleting}>
          {isEditing ? t.update : t.add}
        </Button>
      </div>
    </div>
  )
}
