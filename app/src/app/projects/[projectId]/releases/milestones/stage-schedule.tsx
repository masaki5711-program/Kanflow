"use client"

import { useState } from "react"
import { CalendarDays } from "lucide-react"
import { Button, Field, Input, Select } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { PLAN_STATUSES } from "@/lib/plan-progress"
import { SectionFrame, type Announce } from "../improvement/section-frame"
import { stageStatusLabel, type Stage } from "./milestone-types"
import type { PlanPatcher } from "./use-milestone-board"

interface Props {
  stage: Stage
  canEdit: boolean
  patchPlanItem: PlanPatcher
  announce: Announce
  onDirty: (dirty: boolean) => void
}

export interface ScheduleForm {
  plannedStart: string
  plannedEnd: string
  actualStart: string
  actualEnd: string
  status: string
}

export function scheduleForm(stage: Stage): ScheduleForm {
  return {
    plannedStart: stage.plannedStart ?? "",
    plannedEnd: stage.plannedEnd ?? "",
    actualStart: stage.actualStart ?? "",
    actualEnd: stage.actualEnd ?? "",
    status: stage.status,
  }
}

/**
 * Pure: the plan PATCH body for the changed fields (empty date = null =
 * 日程未定), or null when nothing changed. Planned dates and status of a
 * stage with steps are derived in 全体計画, so they are never sent for it.
 */
export function schedulePatch(stage: Stage, form: ScheduleForm): Record<string, unknown> | null {
  const initial = scheduleForm(stage)
  const keys = (stage.hasChildren ? ["actualStart", "actualEnd"] : ["plannedStart", "plannedEnd", "actualStart", "actualEnd", "status"]) as Array<keyof ScheduleForm>
  const changed = keys.filter((k) => form[k] !== initial[k])
  if (changed.length === 0) return null
  const body: Record<string, unknown> = Object.fromEntries(changed.map((k) => [k, k === "status" ? form[k] : form[k] || null]))
  // The plan API wants both planned dates together.
  if ("plannedStart" in body || "plannedEnd" in body) Object.assign(body, { plannedStart: form.plannedStart || null, plannedEnd: form.plannedEnd || null })
  return { ...body, version: stage.version }
}

/** 日程と状態: planned (leaf only) and actual dates plus status, saved to the plan item. */
export function StageSchedule({ stage, canEdit, patchPlanItem, announce, onDirty }: Props) {
  const { t } = useLanguage()
  const [form, setForm] = useState<ScheduleForm>(() => scheduleForm(stage))
  const [saving, setSaving] = useState(false)
  const patch = schedulePatch(stage, form)
  const incomplete = !stage.hasChildren && Boolean(form.plannedStart) !== Boolean(form.plannedEnd)
  const set = (key: keyof ScheduleForm, value: string) => {
    const next = { ...form, [key]: value }
    setForm(next)
    onDirty(schedulePatch(stage, next) !== null)
  }

  async function save() {
    if (!patch || incomplete) return
    setSaving(true)
    const result = await patchPlanItem(stage.id, patch)
    setSaving(false)
    if (result.ok) onDirty(false)
    announce(result.ok ? t.msSaved : result.message, result.ok ? "success" : "error")
  }

  const plannedLocked = !canEdit || stage.hasChildren
  return (
    <SectionFrame title={t.msPanelSchedule} icon={<CalendarDays aria-hidden="true" className="h-5 w-5 text-primary" />}>
      {stage.hasChildren && <p className="mb-2 text-caption text-fg-muted">{t.msDerivedHint}</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label={t.msPlannedStart}>
          <Input type="date" value={form.plannedStart} readOnly={plannedLocked} onChange={(e) => set("plannedStart", e.target.value)} />
        </Field>
        <Field label={t.msPlannedEnd} error={incomplete ? t.msDatesIncomplete : undefined}>
          <Input type="date" value={form.plannedEnd} readOnly={plannedLocked} onChange={(e) => set("plannedEnd", e.target.value)} />
        </Field>
        <Field label={t.msActualStart}>
          <Input type="date" value={form.actualStart} readOnly={!canEdit} onChange={(e) => set("actualStart", e.target.value)} />
        </Field>
        <Field label={t.msActualEnd}>
          <Input type="date" value={form.actualEnd} readOnly={!canEdit} onChange={(e) => set("actualEnd", e.target.value)} />
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <Field label={t.msStatus} className="w-44">
          <Select value={form.status} disabled={plannedLocked} onChange={(e) => set("status", e.target.value)}>
            {PLAN_STATUSES.map((s) => (
              <option key={s} value={s}>
                {stageStatusLabel(s, t)}
              </option>
            ))}
          </Select>
        </Field>
        {canEdit && (
          <Button onClick={() => void save()} loading={saving} disabled={!patch || incomplete}>
            {t.save}
          </Button>
        )}
      </div>
    </SectionFrame>
  )
}
