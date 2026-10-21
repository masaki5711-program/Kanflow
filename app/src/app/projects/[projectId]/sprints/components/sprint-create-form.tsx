"use client"

import { useId, useState } from "react"
import { useLanguage } from "@/lib/language-context"
import { Button, Field, Input, Textarea } from "@/components/ui"
import { toLocalIsoDate } from "../lib/locale"
import type { CarryOverSource } from "../lib/sprint-metrics"
import CarryOverList from "./carry-over-list"
import PbSelectionList from "./pb-selection-list"
import type { ProjectSettings, ReadyPbItem } from "./types"
import type { CreateSprintInput } from "../hooks/use-sprint-actions"
import { Calendar, ChartColumn, Gauge, Plus, Tag, Target } from "lucide-react"

interface Props {
  readyPbItems: ReadyPbItem[]
  /** Unfinished work of the previous sprint, offered for carrying over (null = nothing left). */
  carryOverSource?: CarryOverSource | null
  settings: ProjectSettings | null
  pointUnitLabel: string
  /** Average actual score of finished sprints (null when there are none). */
  avgActual: number | null
  doneSprintCount: number
  onCreate: (input: CreateSprintInput) => Promise<boolean>
  onClose: () => void
  onViewPbi: (pbiId: string) => void
}

export interface SprintFormState {
  sprintName: string
  startDate: string
  endDate: string
  sprintGoal: string
  capacity: number
}

type SeededField = "startDate" | "endDate" | "capacity"

export function initialForm(settings: ProjectSettings | null, today: Date = new Date()): SprintFormState {
  const end = new Date(today)
  end.setDate(end.getDate() + (settings?.sprintDurationDays ?? 7))
  return {
    sprintName: "",
    startDate: settings ? toLocalIsoDate(today) : "",
    endDate: settings ? toLocalIsoDate(end) : "",
    sprintGoal: "",
    capacity: settings?.defaultCapacity ?? 0,
  }
}

/**
 * Pure (S-16): once the project defaults arrive, fill the date / capacity
 * fields the user has not touched yet; edited fields are kept.
 */
export function seedUntouched(
  form: SprintFormState, settings: ProjectSettings, touched: ReadonlySet<SeededField>, today: Date = new Date(),
): SprintFormState {
  const defaults = initialForm(settings, today)
  return {
    ...form,
    startDate: touched.has("startDate") ? form.startDate : defaults.startDate,
    endDate: touched.has("endDate") ? form.endDate : defaults.endDate,
    capacity: touched.has("capacity") ? form.capacity : defaults.capacity,
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
  readyPbItems, carryOverSource = null, settings, pointUnitLabel, avgActual, doneSprintCount, onCreate, onClose, onViewPbi,
}: Props) {
  const { t, pt } = useLanguage()
  const headingId = useId()
  const [form, setForm] = useState(() => initialForm(settings))
  const [touched, setTouched] = useState<ReadonlySet<SeededField>>(() => new Set())
  // Defaults that were not available at open time are applied when they arrive
  // (state adjusted during render, no effect needed).
  const [seededWith, setSeededWith] = useState<ProjectSettings | null>(settings)
  if (settings && seededWith === null) {
    setSeededWith(settings)
    setForm((prev) => seedUntouched(prev, settings, touched))
  }
  function edit(patch: Partial<SprintFormState>) {
    setForm((prev) => ({ ...prev, ...patch }))
    const seeded = (Object.keys(patch) as Array<keyof SprintFormState>).filter(
      (k): k is SeededField => k === "startDate" || k === "endDate" || k === "capacity",
    )
    if (seeded.length > 0) setTouched((prev) => new Set([...prev, ...seeded]))
  }
  const [selectedPbIds, setSelectedPbIds] = useState<ReadonlySet<string>>(() => new Set())
  // Unfinished PBIs of the previous sprint are carried unless the user unticks them.
  const [skippedCarryIds, setSkippedCarryIds] = useState<ReadonlySet<string>>(() => new Set())
  const [saving, setSaving] = useState(false)
  const carried = (carryOverSource?.candidates ?? []).filter((c) => !skippedCarryIds.has(c.pbItem.id))
  const carriedIds = new Set(carried.map((c) => c.pbItem.id))
  const carriedWorkload = carried.reduce((sum, c) => sum + (c.pbItem.workloadScore ?? 0), 0)
  // A PBI taken over from the previous sprint is not offered a second time from the backlog.
  const pickableItems = readyPbItems.filter((item) => !carriedIds.has(item.id))
  const pickedIds = Array.from(selectedPbIds).filter((id) => !carriedIds.has(id))

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

  function toggleCarry(id: string) {
    setSkippedCarryIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const ok = await onCreate({
      ...form,
      selectedPbIds: pickedIds,
      ...(carryOverSource && carried.length > 0
        ? { carryOver: { fromSprintId: carryOverSource.sprint.id, pbItemIds: carried.map((c) => c.pbItem.id) } }
        : {}),
    })
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
                onChange={(e) => edit({ sprintName: e.target.value })} required />
            </Field>
            <Field label={<IconLabel icon={<Gauge className="w-4 h-4" />}>{t.sprintCapacity}</IconLabel>} required>
              <div className="flex items-center gap-2">
                <Input type="number" min={0} value={form.capacity} required
                  onChange={(e) => edit({ capacity: parseInt(e.target.value, 10) || 0 })} />
                {settings && <span className="text-caption text-fg-muted whitespace-nowrap">{pointUnitLabel}</span>}
              </div>
            </Field>
            <Field label={<IconLabel icon={<Calendar className="w-4 h-4" />}>{t.sprintStartDate}</IconLabel>} required>
              <Input type="date" value={form.startDate} required
                onChange={(e) => edit({ startDate: e.target.value })} />
            </Field>
            <Field label={<IconLabel icon={<Calendar className="w-4 h-4" />}>{t.sprintEndDate}</IconLabel>} required>
              <Input type="date" value={form.endDate} min={form.startDate || undefined} required
                onChange={(e) => edit({ endDate: e.target.value })} />
            </Field>
          </div>
          <Field label={<IconLabel icon={<Target className="w-4 h-4" />}>{pt.sprintGoal}</IconLabel>}>
            <Textarea value={form.sprintGoal} rows={2} maxLength={5000}
              onChange={(e) => edit({ sprintGoal: e.target.value })} />
          </Field>

          {carryOverSource && (
            <CarryOverList source={carryOverSource} skippedIds={skippedCarryIds} onToggle={toggleCarry} onViewPbi={onViewPbi} />
          )}

          <PbSelectionList items={pickableItems} selectedIds={selectedPbIds} capacity={form.capacity}
            extraWorkload={carriedWorkload} onToggle={toggle} onViewPbi={onViewPbi} />

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>{t.cancel}</Button>
            <Button type="submit" loading={saving} leftIcon={<Plus className="w-4 h-4" />}>
              {t.sprintCreateWithCount.replace("{count}", String(pickedIds.length + carried.length))}
            </Button>
          </div>
        </form>
      </div>
    </section>
  )
}
