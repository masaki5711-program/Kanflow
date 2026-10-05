"use client"

import { useState } from "react"
import { ListChecks, Plus, Trash2 } from "lucide-react"
import { Button, Field, IconButton, Input } from "@/components/ui"
import { fillTemplate } from "@/lib/fill-template"
import { formatLongDate } from "@/lib/format-date"
import { useLanguage } from "@/lib/language-context"
import { replaceConditionsInNotes } from "@/lib/milestones/checklist"
import { SectionFrame, type Announce } from "../improvement/section-frame"
import type { Stage } from "./milestone-types"
import type { BoardWriter, PlanPatcher } from "./use-milestone-board"

interface Props {
  stage: Stage
  canEdit: boolean
  canTrack: boolean
  write: BoardWriter
  patchPlanItem: PlanPatcher
  announce: Announce
}

/**
 * 完了条件 of a stage: anyone ticks them (stored on the board); the PO / SM
 * add or remove conditions, which rewrites the 完了条件 block of the plan
 * item's notes through the plan API (version-checked, so 全体計画 and the
 * board never diverge).
 */
export function StageConditions({ stage, canEdit, canTrack, write, patchPlanItem, announce }: Props) {
  const { t, language } = useLanguage()
  const [busy, setBusy] = useState(false)
  // Optimistic ticks: shown at once, dropped when the reloaded board agrees (or the save failed).
  const [overrides, setOverrides] = useState<Readonly<Record<string, boolean>>>({})
  const settled = Object.entries(overrides).filter(([label, v]) => stage.conditions.find((c) => c.label === label)?.checked === v)
  if (settled.length > 0) setOverrides(Object.fromEntries(Object.entries(overrides).filter(([label]) => !settled.some(([l]) => l === label))))

  async function toggle(label: string, checked: boolean) {
    setOverrides((prev) => ({ ...prev, [label]: checked }))
    const result = await write(`/stages/${stage.id}/checklist`, { method: "PUT", json: { label, checked } })
    if (!result.ok) setOverrides((prev) => Object.fromEntries(Object.entries(prev).filter(([l]) => l !== label)))
    announce(result.ok ? t.msSaved : result.message, result.ok ? "success" : "error")
  }

  async function saveList(labels: string[]): Promise<boolean> {
    setBusy(true)
    const result = await patchPlanItem(stage.id, { notes: replaceConditionsInNotes(stage.notes, labels), version: stage.version })
    setBusy(false)
    announce(result.ok ? t.msSaved : result.message, result.ok ? "success" : "error")
    return result.ok
  }

  const labels = stage.conditions.map((c) => c.label)
  return (
    <SectionFrame title={t.msPanelConditions} icon={<ListChecks aria-hidden="true" className="h-5 w-5 text-primary" />}>
      {stage.conditions.length === 0 ? (
        <p className="text-caption text-fg-muted">{t.msPanelConditionsNone}</p>
      ) : (
        <ul className="space-y-1.5">
          {stage.conditions.map((c) => (
            <li key={c.label} className="flex items-center gap-2 rounded-ui-md border border-border px-2 py-1.5">
              <label className="flex min-h-9 flex-1 cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  className="h-5 w-5 shrink-0 accent-primary"
                  checked={overrides[c.label] ?? c.checked}
                  disabled={!canTrack || busy}
                  onChange={(e) => void toggle(c.label, e.target.checked)}
                />
                <span className={(overrides[c.label] ?? c.checked) ? "text-body text-fg-muted line-through" : "text-body text-fg"}>{c.label}</span>
              </label>
              {c.checked && c.checkedAt && (
                <span className="hidden text-caption text-fg-muted sm:inline">
                  {fillTemplate(t.msConditionTickedBy, { name: c.checkedByName ?? "—", date: formatLongDate(c.checkedAt, language) })}
                </span>
              )}
              {canEdit && (
                <IconButton
                  size="sm"
                  label={fillTemplate(t.msConditionRemove, { label: c.label })}
                  icon={<Trash2 className="h-4 w-4" />}
                  disabled={busy}
                  onClick={() => void saveList(labels.filter((l) => l !== c.label))}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && <AddCondition busy={busy} onAdd={(label) => saveList([...labels, label])} />}
    </SectionFrame>
  )
}

function AddCondition({ busy, onAdd }: { busy: boolean; onAdd: (label: string) => Promise<boolean> }) {
  const { t } = useLanguage()
  const [text, setText] = useState("")

  async function submit() {
    const label = text.trim()
    if (!label) return
    if (await onAdd(label)) setText("")
  }

  return (
    <form
      className="mt-3 flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <Field label={t.msConditionAdd} className="flex-1">
        <Input value={text} maxLength={255} placeholder={t.msConditionAddPlaceholder} onChange={(e) => setText(e.target.value)} />
      </Field>
      <Button type="submit" variant="secondary" leftIcon={<Plus className="h-4 w-4" />} disabled={!text.trim()} loading={busy}>
        {t.msPunchAdd}
      </Button>
    </form>
  )
}
