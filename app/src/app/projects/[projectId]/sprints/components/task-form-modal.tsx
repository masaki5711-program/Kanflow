"use client"

import { useState } from "react"
import { useLanguage } from "@/lib/language-context"
import { GlossaryHint } from "@/components/i18n-text"
import { pickText } from "@/lib/translation/pick-text"
import { Button, Field, Input, Modal, Select } from "@/components/ui"
import { usePbiDetail } from "../hooks/use-pbi-detail"
import { EMPTY_TASK_FORM, taskFormFromItem } from "../lib/task-payload"
import FixedTaskBulkAdd from "./fixed-task-bulk-add"
import ModalCancelButton from "./modal-cancel-button"
import TaskAssigneePicker from "./task-assignee-picker"
import TaskPbiDetailPanel from "./task-pbi-detail-panel"
import type { Member, Sprint, SprintItem, SprintPbItem, TaskFormState } from "./types"

interface TaskFormModalProps {
  projectId: string
  sprint: Sprint
  /** Task being edited; null = add a new task. */
  task: SprintItem | null
  /** Pre-selected PBI when adding from a PBI group. */
  initialPbItemId?: string
  members: Member[]
  pointUnit: string
  canEditPbi?: boolean
  /** Resolves true when saved (errors are toasted by the caller). */
  onSave: (form: TaskFormState) => Promise<boolean>
  onBulkAdd?: (pbItemId: string, assignee: string | null, taskNames: string[]) => Promise<boolean>
  onPbiSaved?: () => void
  onClose: () => void
}

const FORM_ID = "sprint-task-form"
const FORM_KEYS = Object.keys(EMPTY_TASK_FORM) as (keyof TaskFormState)[]

export default function TaskFormModal({
  projectId, sprint, task, initialPbItemId, members, pointUnit, canEditPbi = false,
  onSave, onBulkAdd, onPbiSaved, onClose,
}: TaskFormModalProps) {
  const { t, language } = useLanguage()
  const isEdit = task !== null
  const [initial] = useState<TaskFormState>(() =>
    task ? taskFormFromItem(task) : { ...EMPTY_TASK_FORM, pbItemId: initialPbItemId ?? "" },
  )
  const [form, setForm] = useState<TaskFormState>(initial)
  const [saving, setSaving] = useState(false)
  const pbi = usePbiDetail(projectId, form.pbItemId, canEditPbi, onPbiSaved)

  const sprintPbItems: SprintPbItem[] = [...new Map(sprint.items.map((i) => [i.pbItem.id, i.pbItem])).values()]
  const hasPbItems = sprintPbItems.length > 0
  const isDirty = FORM_KEYS.some((k) => form[k] !== initial[k]) || pbi.isDirty
  const busy = saving || pbi.isSaving
  const sprintName = pickText(sprint.i18n, "sprintName", sprint.sprintName, language).text || sprint.sprintName

  function pbLabel(pb: SprintPbItem): string {
    return (
      pickText(pb.i18n, "initiative", pb.initiative, language).text ||
      pickText(pb.i18n, "userStory", pb.userStory, language).text ||
      t.sprintNotEntered
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setSaving(true)
    try {
      // Save PBI edits first so the task submit sees the latest PBI state.
      if (!(await pbi.saveIfDirty())) return
      if (await onSave(form)) onClose()
    } finally {
      setSaving(false)
    }
  }

  async function handleBulkAdd(taskNames: string[]) {
    if (!onBulkAdd || !form.pbItemId) return
    await onBulkAdd(form.pbItemId, form.assignee || null, taskNames)
    onClose()
  }

  return (
    <Modal open onClose={onClose} size="lg" isDirty={isDirty && !busy}
      title={isEdit ? t.sprintTaskEdit : t.sprintAddTask} description={sprintName}
      footer={
        <>
          <ModalCancelButton disabled={busy} />
          <Button type="submit" form={FORM_ID} loading={busy} disabled={!isEdit && !hasPbItems}>
            {isEdit ? t.update : t.add}
          </Button>
        </>
      }>
      {!isEdit && !hasPbItems && (
        <p role="alert" className="bg-warning-soft border border-warning/30 rounded-ui-sm px-3 py-2 text-body text-warning-strong mb-4">
          {t.sprintTaskNeedsPbiFirst}
        </p>
      )}

      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4">
        {!isEdit && (
          <Field label={t.sprintPbItem} required>
            <Select value={form.pbItemId} required disabled={!hasPbItems}
              onChange={(e) => setForm({ ...form, pbItemId: e.target.value })}>
              <option value="">-- {t.sprintSelect} --</option>
              {sprintPbItems.map((pb) => (
                <option key={pb.id} value={pb.id}>#{pb.displayId} {pbLabel(pb)}</option>
              ))}
            </Select>
          </Field>
        )}

        <TaskPbiDetailPanel pbi={pbi} canEdit={canEditPbi} />

        {!isEdit && onBulkAdd && <FixedTaskBulkAdd pbItemId={form.pbItemId} onBulkAdd={handleBulkAdd} />}

        <div>
          <Field label={t.sprintTaskName} required>
            <Input value={form.taskName} required placeholder={t.taskNamePlaceholder} data-autofocus={isEdit || undefined}
              onChange={(e) => setForm({ ...form, taskName: e.target.value })} />
          </Field>
          <GlossaryHint className="mt-1" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TaskAssigneePicker members={members} value={form.assignee} onChange={(assignee) => setForm({ ...form, assignee })} />
          <Field label={`${t.sprintEstimatedHoursShort} (${pointUnit})`}>
            <Input type="number" step="0.5" min="0" value={form.estimatedHours} placeholder={t.taskHoursPlaceholder}
              onChange={(e) => setForm({ ...form, estimatedHours: e.target.value })} />
          </Field>
        </div>
        {isEdit && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={`${t.sprintActualHoursShort} (${pointUnit})`}>
              <Input type="number" step="0.5" min="0" value={form.actualHours}
                onChange={(e) => setForm({ ...form, actualHours: e.target.value })} />
            </Field>
            <Field label={t.sprintStatus}>
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="todo">{t.taskTodo}</option>
                <option value="in_progress">{t.taskInProgress}</option>
                <option value="done">{t.taskDone}</option>
              </Select>
            </Field>
          </div>
        )}
      </form>
    </Modal>
  )
}
