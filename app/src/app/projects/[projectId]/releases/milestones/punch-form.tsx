"use client"

import { useState } from "react"
import { Button, Field, Input, Select, Textarea } from "@/components/ui"
import { MS_NAME_MAX, MS_TEXT_MAX } from "@/lib/milestones/constants"
import { useLanguage } from "@/lib/language-context"
import type { Member, PunchItem } from "./milestone-types"

const OTHER = "__other__"

export interface PunchFormValues {
  title: string
  detail: string
  /** A member id, "" = unassigned, OTHER = a typed name. */
  assignee: string
  assigneeName: string
  dueDate: string
  planItemId: string
}

export function punchFormOf(p: PunchItem): PunchFormValues {
  return {
    title: p.title,
    detail: p.detail ?? "",
    assignee: p.assigneeId ?? (p.assigneeName ? OTHER : ""),
    assigneeName: p.assigneeId ? "" : (p.assigneeName ?? ""),
    dueDate: p.dueDate ?? "",
    planItemId: p.planItemId ?? "",
  }
}

/** Pure: the PATCH body of the form (every field; blanks clear). */
export function punchPatch(v: PunchFormValues): Record<string, unknown> {
  const assignee = v.assignee === OTHER ? { assigneeId: null, assigneeName: v.assigneeName.trim() || null } : v.assignee ? { assigneeId: v.assignee } : { assigneeId: null, assigneeName: null }
  return { title: v.title.trim(), detail: v.detail.trim() || null, dueDate: v.dueDate || null, planItemId: v.planItemId || null, ...assignee }
}

interface Props {
  initial: PunchFormValues
  members: readonly Member[]
  stages: ReadonlyArray<{ id: string; label: string }>
  saving: boolean
  onSave: (values: PunchFormValues) => void
  onCancel: () => void
}

/** Edit a 残課題: title, details, assignee (member or a typed name), due day and stage. */
export function PunchForm({ initial, members, stages, saving, onSave, onCancel }: Props) {
  const { t } = useLanguage()
  const [v, setV] = useState(initial)
  const set = <K extends keyof PunchFormValues>(key: K, value: PunchFormValues[K]) => setV((prev) => ({ ...prev, [key]: value }))
  return (
    <form
      className="mt-2 grid grid-cols-1 gap-3 rounded-ui-md bg-surface-muted p-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (v.title.trim()) onSave(v)
      }}
    >
      <Field label={t.msPunchTitle} required className="sm:col-span-2">
        <Input value={v.title} maxLength={MS_NAME_MAX} onChange={(e) => set("title", e.target.value)} data-autofocus />
      </Field>
      <Field label={t.msPunchDetail} className="sm:col-span-2">
        <Textarea rows={2} value={v.detail} maxLength={MS_TEXT_MAX} onChange={(e) => set("detail", e.target.value)} />
      </Field>
      <Field label={t.msPunchAssignee}>
        <Select value={v.assignee} onChange={(e) => set("assignee", e.target.value)}>
          <option value="">{t.msPunchAssigneeNone}</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name ?? m.id}
            </option>
          ))}
          <option value={OTHER}>{t.msPunchAssigneeOther}</option>
        </Select>
      </Field>
      {v.assignee === OTHER ? (
        <Field label={t.msPunchAssigneeName}>
          <Input value={v.assigneeName} maxLength={MS_NAME_MAX} onChange={(e) => set("assigneeName", e.target.value)} />
        </Field>
      ) : (
        <Field label={t.msPunchDue}>
          <Input type="date" value={v.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
        </Field>
      )}
      {v.assignee === OTHER && (
        <Field label={t.msPunchDue}>
          <Input type="date" value={v.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
        </Field>
      )}
      <Field label={t.msCheckStage}>
        <Select value={v.planItemId} onChange={(e) => set("planItemId", e.target.value)}>
          <option value="">{t.msCheckNoStage}</option>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t.cancel}
        </Button>
        <Button type="submit" loading={saving} disabled={!v.title.trim()}>
          {t.save}
        </Button>
      </div>
    </form>
  )
}
