"use client"

import { useState } from "react"
import { CalendarCheck, CircleCheck, Plus, Trash2, Undo2, TriangleAlert, CircleX } from "lucide-react"
import { Badge, Button, Field, IconButton, Input } from "@/components/ui"
import { CHECK_NOTE_MAX } from "@/lib/improvement/constants"
import { checkKindLabel } from "@/lib/improvement/labels"
import { isCheckDue } from "@/lib/improvement/metrics"
import { formatLongDate } from "@/lib/format-date"
import { useLanguage } from "@/lib/language-context"
import type { ImprovementCheck, ImprovementForm, ImprovementItem } from "./improvement-types"
import { SectionFrame, type Announce } from "./section-frame"
import type { BoardWriter } from "./use-improvement-board"

interface Props {
  item: ImprovementItem
  form: ImprovementForm
  canManage: boolean
  canTrack: boolean
  onChange: <K extends keyof ImprovementForm>(key: K, value: ImprovementForm[K]) => void
  write: BoardWriter
  announce: Announce
}

/** 定着確認: the 展開日 (creates the 1 / 3 month checks on save), each check's result, custom check dates. */
export function CheckSection({ item, form, canManage, canTrack, onChange, write, announce }: Props) {
  const { t } = useLanguage()

  async function run(path: string, init: Parameters<BoardWriter>[2], success: string) {
    const result = await write(item.id, path, init)
    announce(result.ok ? success : result.message, result.ok ? "success" : "error")
    return result.ok
  }

  return (
    <SectionFrame title={t.kzSectionChecks} icon={<CalendarCheck aria-hidden="true" className="h-5 w-5 text-primary" />}>
      <div className="sm:max-w-xs">
        <Field label={t.kzReleaseDate} hint={t.kzReleaseDateHint}>
          <Input type="date" value={form.releaseDate} readOnly={!canManage} onChange={(e) => onChange("releaseDate", e.target.value)} />
        </Field>
      </div>
      {item.checks.length === 0 ? (
        <p className="mt-3 text-caption text-fg-muted">{t.kzCheckNone}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {item.checks.map((c) => (
            <CheckRow
              key={c.id}
              check={c}
              canManage={canManage}
              canTrack={canTrack}
              onRecord={(result, note) => run(`/checks/${c.id}`, { method: "PATCH", json: { result, note } }, result ? t.kzCheckRecorded : t.kzSaved)}
              onDelete={() => void run(`/checks/${c.id}`, { method: "DELETE" }, t.kzSaved)}
            />
          ))}
        </ul>
      )}
      {canManage && <AddCheck onAdd={(dueDate) => run("/checks", { method: "POST", json: { dueDate } }, t.kzSaved)} />}
    </SectionFrame>
  )
}

interface RowProps {
  check: ImprovementCheck
  canManage: boolean
  canTrack: boolean
  onRecord: (result: string | null, note: string | null) => Promise<boolean>
  onDelete: () => void
}

function CheckRow({ check, canManage, canTrack, onRecord, onDelete }: RowProps) {
  const { t, language } = useLanguage()
  const [note, setNote] = useState(check.note ?? "")
  const [saving, setSaving] = useState(false)
  const kind = checkKindLabel(check.kind, t)
  const overdue = !check.checkedAt && isCheckDue(check.dueDate, new Date())

  async function record(result: string | null) {
    setSaving(true)
    await onRecord(result, result ? note.trim() || null : null)
    setSaving(false)
  }

  return (
    <li className={`rounded-ui-md border p-3 ${overdue ? "border-danger/50 bg-danger-soft/40" : "border-border"}`} data-check-kind={check.kind}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-body font-semibold text-fg">{kind}</span>
        <span className="text-caption text-fg-muted">{t.kzCheckDue.replace("{date}", formatLongDate(check.dueDate, language, { utc: true }))}</span>
        {overdue && <Badge tone="danger"><TriangleAlert aria-hidden="true" className="mr-1 inline h-3 w-3" />{t.kzCheckOverdue}</Badge>}
        {check.result && (
          <Badge tone={check.result === "sustained" ? "success" : "danger"}>
            {check.result === "sustained" ? t.kzCheckSustained : t.kzCheckRegressed}
          </Badge>
        )}
        {canManage && <IconButton size="sm" label={`${t.kzCheckDelete}（${kind}）`} icon={<Trash2 className="h-4 w-4" />} onClick={onDelete} className="ml-auto" />}
      </div>
      {check.checkedAt ? (
        <div className="mt-1 flex flex-wrap items-center gap-2 text-caption text-fg-muted">
          <span>{t.kzCheckRecordedBy.replace("{name}", check.checkedByName ?? "—").replace("{date}", formatLongDate(check.checkedAt, language))}</span>
          {check.note && <span className="text-fg">「{check.note}」</span>}
          {canTrack && (
            <Button size="sm" variant="ghost" leftIcon={<Undo2 className="h-4 w-4" />} loading={saving} onClick={() => void record(null)}>
              {t.kzCheckUndo}
            </Button>
          )}
        </div>
      ) : canTrack ? (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
          <Field label={`${t.kzCheckNote}（${kind}）`} hideLabel className="flex-1">
            <Input value={note} maxLength={CHECK_NOTE_MAX} placeholder={t.kzCheckNotePlaceholder} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1 border-success text-success-strong" leftIcon={<CircleCheck className="h-4 w-4" />} disabled={saving} onClick={() => void record("sustained")}>
              {t.kzCheckSustained}
            </Button>
            <Button variant="secondary" className="flex-1 border-danger text-danger-strong" leftIcon={<CircleX className="h-4 w-4" />} disabled={saving} onClick={() => void record("regressed")}>
              {t.kzCheckRegressed}
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-1 text-caption text-fg-muted">{t.kzCheckPending}</p>
      )}
    </li>
  )
}

function AddCheck({ onAdd }: { onAdd: (dueDate: string) => Promise<boolean> }) {
  const { t } = useLanguage()
  const [date, setDate] = useState("")
  const [saving, setSaving] = useState(false)

  async function add() {
    if (!date || saving) return
    setSaving(true)
    if (await onAdd(date)) setDate("")
    setSaving(false)
  }

  return (
    <div className="mt-3 flex items-end gap-2">
      <Field label={t.kzCheckAddDate} className="flex-1 sm:max-w-xs">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Button variant="secondary" leftIcon={<Plus className="h-4 w-4" />} disabled={!date} loading={saving} onClick={() => void add()}>
        {t.kzCheckAdd}
      </Button>
    </div>
  )
}
