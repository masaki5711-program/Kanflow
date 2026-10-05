"use client"

import { useState } from "react"
import { CircleAlert, CircleCheck, CircleX, Pencil, Trash2, Undo2 } from "lucide-react"
import { Badge, Button, Field, IconButton, Input, Select, Textarea, cn, type BadgeTone } from "@/components/ui"
import { fillTemplate } from "@/lib/fill-template"
import { formatLongDate } from "@/lib/format-date"
import { useLanguage } from "@/lib/language-context"
import { MS_NAME_MAX, MS_TEXT_MAX, type CheckResult } from "@/lib/milestones/constants"
import { resultLabel, type AcceptanceCheck } from "./milestone-types"

export interface CheckRowProps {
  check: AcceptanceCheck
  todayKey: string
  stageName: string | null
  stageOptions: ReadonlyArray<{ id: string; label: string }>
  canEdit: boolean
  canTrack: boolean
  /** PATCH body → ok. */
  onPatch: (body: Record<string, unknown>, success: string) => Promise<boolean>
  onDelete: () => void
}

const RESULT_TONE: Record<string, BadgeTone> = { passed: "success", conditional: "warning", failed: "danger" }
const RESULT_BUTTONS: ReadonlyArray<{ result: CheckResult; icon: typeof CircleCheck; className: string }> = [
  { result: "passed", icon: CircleCheck, className: "border-success text-success-strong" },
  { result: "conditional", icon: CircleAlert, className: "border-warning text-warning-strong" },
  { result: "failed", icon: CircleX, className: "border-danger text-danger-strong" },
]

/** One チェック項目: criterion, then the result buttons with 立会者 / day / note, or the recorded result. */
export function CheckRow({ check, todayKey, stageName, stageOptions, canEdit, canTrack, onPatch, onDelete }: CheckRowProps) {
  const { t, language } = useLanguage()
  const [witness, setWitness] = useState(check.witness ?? "")
  const [day, setDay] = useState(check.checkedAt ?? todayKey)
  const [note, setNote] = useState(check.note ?? "")
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)

  async function record(result: CheckResult | null) {
    setSaving(true)
    const body = result ? { result, witness: witness.trim() || null, checkedAt: day || null, note: note.trim() || null } : { result: null }
    await onPatch(body, result ? fillTemplate(t.msCheckRecorded, { name: check.name, result: resultLabel(result, t) }) : t.msSaved)
    setSaving(false)
  }

  return (
    <li className={cn("rounded-ui-md border p-3", check.result === "failed" ? "border-danger/50 bg-danger-soft/30" : check.result ? "border-success/40 bg-success-soft/20" : "border-border bg-surface")} data-testid="ms-check-row">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-body font-semibold text-fg">{check.name}</p>
          {check.criterion && (
            <p className="mt-0.5 whitespace-pre-wrap text-caption text-fg-muted">
              {t.msCheckCriterion}: {check.criterion}
            </p>
          )}
          {stageName && <p className="text-caption text-fg-muted">{stageName}</p>}
        </div>
        <Badge tone={check.result ? RESULT_TONE[check.result] : "neutral"}>{resultLabel(check.result, t)}</Badge>
        {canEdit && <IconButton size="sm" label={fillTemplate(t.msCheckEdit, { name: check.name })} icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing((v) => !v)} />}
        {canEdit && <IconButton size="sm" variant="danger" label={fillTemplate(t.msCheckDelete, { name: check.name })} icon={<Trash2 className="h-4 w-4" />} onClick={onDelete} />}
      </div>
      {check.result ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-fg-muted">
          {check.witness && (
            <span>
              {t.msWitness}: <span className="text-fg">{check.witness}</span>
            </span>
          )}
          {check.checkedAt && <span>{formatLongDate(check.checkedAt, language, { utc: true })}</span>}
          {check.recordedByName && <span>{fillTemplate(t.msCheckRecordedBy, { name: check.recordedByName })}</span>}
          {check.note && <span className="text-fg">「{check.note}」</span>}
          {canTrack && (
            <Button size="sm" variant="ghost" leftIcon={<Undo2 className="h-4 w-4" />} loading={saving} onClick={() => void record(null)}>
              {t.msCheckUndo}
            </Button>
          )}
        </div>
      ) : (
        canTrack && (
          <div className="mt-2 space-y-2">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Field label={`${t.msWitness}（${check.name}）`} hideLabel>
                <Input value={witness} maxLength={MS_NAME_MAX} placeholder={`${t.msWitness}: ${t.msWitnessPlaceholder}`} onChange={(e) => setWitness(e.target.value)} />
              </Field>
              <Field label={`${t.msCheckedAt}（${check.name}）`} hideLabel>
                <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
              </Field>
              <Field label={`${t.msCheckNote}（${check.name}）`} hideLabel>
                <Input value={note} maxLength={MS_TEXT_MAX} placeholder={t.msCheckNote} onChange={(e) => setNote(e.target.value)} />
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              {RESULT_BUTTONS.map(({ result, icon: Icon, className }) => (
                <Button key={result} variant="secondary" className={cn("flex-1 sm:flex-none", className)} leftIcon={<Icon className="h-4 w-4" />} disabled={saving} onClick={() => void record(result)}>
                  {resultLabel(result, t)}
                </Button>
              ))}
            </div>
          </div>
        )
      )}
      {editing && <CheckEditForm check={check} stageOptions={stageOptions} onCancel={() => setEditing(false)} onSave={async (body) => (await onPatch(body, t.msSaved)) && setEditing(false)} />}
    </li>
  )
}

interface EditProps {
  check: AcceptanceCheck
  stageOptions: ReadonlyArray<{ id: string; label: string }>
  onCancel: () => void
  onSave: (body: Record<string, unknown>) => Promise<unknown>
}

function CheckEditForm({ check, stageOptions, onCancel, onSave }: EditProps) {
  const { t } = useLanguage()
  const [name, setName] = useState(check.name)
  const [criterion, setCriterion] = useState(check.criterion ?? "")
  const [stage, setStage] = useState(check.planItemId ?? "")
  return (
    <form
      className="mt-2 grid gap-3 rounded-ui-md bg-surface-muted p-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim()) void onSave({ name: name.trim(), criterion: criterion.trim() || null, planItemId: stage || null })
      }}
    >
      <Field label={t.msCheckName} required>
        <Input value={name} maxLength={MS_NAME_MAX} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={t.msCheckCriterion}>
        <Textarea rows={2} value={criterion} maxLength={MS_TEXT_MAX} onChange={(e) => setCriterion(e.target.value)} />
      </Field>
      <Field label={t.msCheckStage}>
        <Select value={stage} onChange={(e) => setStage(e.target.value)}>
          <option value="">{t.msCheckNoStage}</option>
          {stageOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t.cancel}
        </Button>
        <Button type="submit" disabled={!name.trim()}>
          {t.save}
        </Button>
      </div>
    </form>
  )
}
