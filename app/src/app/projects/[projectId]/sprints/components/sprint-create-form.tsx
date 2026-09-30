"use client"

import { useId, useState } from "react"
import { useLanguage } from "@/lib/language-context"
import { Button, Field, Input, Textarea } from "@/components/ui"
import { toLocalIsoDate } from "../lib/locale"
import PbSelectionList from "./pb-selection-list"
import type { ProjectSettings, ReadyPbItem } from "./types"
import type { CreateSprintInput } from "../hooks/use-sprint-actions"
import { Calendar, ChartColumn, Gauge, Plus, Tag, Target } from "lucide-react"

interface Props {
  readyPbItems: ReadyPbItem[]
  settings: ProjectSettings | null
  pointUnitLabel: string
  /** Average actual score of finished sprints (null when there are none). */
  avgActual: number | null
  doneSprintCount: number
  onCreate: (input: CreateSprintInput) => Promise<boolean>
  onClose: () => void
  onViewPbi: (pbiId: string) => void
}

function initialForm(settings: ProjectSettings | null) {
  const start = new Date()
  const end = new Date()
  end.setDate(end.getDate() + (settings?.sprintDurationDays ?? 7))
  return {
    sprintName: "",
    startDate: settings ? toLocalIsoDate(start) : "",
    endDate: settings ? toLocalIsoDate(end) : "",
    sprintGoal: "",
    capacity: settings?.defaultCapacity ?? 0,
  }
}

function IconLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-fg-subtle">{icon}</span>
      {children}
    </span>
  )
}

/** Inline "new sprint" card: basic fields + Ready PB import with a capacity meter. */
export default function SprintCreateForm({
  readyPbItems, settings, pointUnitLabel, avgActual, doneSprintCount, onCreate, onClose, onViewPbi,
}: Props) {
  const { t, pt } = useLanguage()
  const headingId = useId()
  const [form, setForm] = useState(() => initialForm(settings))
  const [selectedPbIds, setSelectedPbIds] = useState<ReadonlySet<string>>(() => new Set())
  const [saving, setSaving] = useState(false)

  const avgLabel = avgActual !== null
    ? `${t.sprintAvgScore.replace("{count}", String(doneSprintCount))}: `
    : null

  function toggle(id: string) {
    setSelectedPbIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const ok = await onCreate({ ...form, selectedPbIds: Array.from(selectedPbIds) })
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <section aria-labelledby={headingId} className="bg-surface rounded-ui-md shadow-ui-sm border border-border overflow-hidden mb-6">
      <div className="h-1 bg-gradient-to-r from-primary via-info to-primary" aria-hidden="true" />
      <div className="p-6">
        <h2 id={headingId} className="text-title font-semibold text-fg mb-4">{t.sprintNewSprint}</h2>

        {avgLabel && (
          <p className="inline-flex items-center gap-2 bg-primary-soft/60 border border-primary/20 rounded-ui-sm px-4 py-2.5 mb-4 text-body text-primary-active">
            <ChartColumn className="w-4 h-4" />
            {avgLabel}<strong>{avgActual}</strong>
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={<IconLabel icon={<Tag className="w-4 h-4" />}>{t.sprintName}</IconLabel>} required>
              <Input value={form.sprintName} maxLength={200} placeholder="Sprint-2026-03-W1"
                onChange={(e) => setForm({ ...form, sprintName: e.target.value })} required />
            </Field>
            <Field label={<IconLabel icon={<Gauge className="w-4 h-4" />}>{t.sprintCapacity}</IconLabel>} required>
              <div className="flex items-center gap-2">
                <Input type="number" min={0} value={form.capacity} required
                  onChange={(e) => setForm({ ...form, capacity: parseInt(e.target.value, 10) || 0 })} />
                {settings && <span className="text-caption text-fg-muted whitespace-nowrap">{pointUnitLabel}</span>}
              </div>
            </Field>
            <Field label={<IconLabel icon={<Calendar className="w-4 h-4" />}>{t.sprintStartDate}</IconLabel>} required>
              <Input type="date" value={form.startDate} required
                onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </Field>
            <Field label={<IconLabel icon={<Calendar className="w-4 h-4" />}>{t.sprintEndDate}</IconLabel>} required>
              <Input type="date" value={form.endDate} min={form.startDate || undefined} required
                onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </Field>
          </div>
          <Field label={<IconLabel icon={<Target className="w-4 h-4" />}>{pt.sprintGoal}</IconLabel>}>
            <Textarea value={form.sprintGoal} rows={2} maxLength={5000}
              onChange={(e) => setForm({ ...form, sprintGoal: e.target.value })} />
          </Field>

          <PbSelectionList items={readyPbItems} selectedIds={selectedPbIds} capacity={form.capacity}
            onToggle={toggle} onViewPbi={onViewPbi} />

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>{t.cancel}</Button>
            <Button type="submit" loading={saving} leftIcon={<Plus className="w-4 h-4" />}>
              {t.sprintCreateWithCount.replace("{count}", String(selectedPbIds.size))}
            </Button>
          </div>
        </form>
      </div>
    </section>
  )
}
