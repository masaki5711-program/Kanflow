"use client"

import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button, Field, IconButton, Input, cn, useConfirm } from "@/components/ui"
import { fillTemplate } from "@/lib/fill-template"
import { DATE_LOCALE } from "@/lib/format-date"
import { useLanguage } from "@/lib/language-context"
import { MS_NAME_MAX } from "@/lib/milestones/constants"
import type { Announce } from "../improvement/section-frame"
import { formatYen, type BudgetLine, type MilestoneBoard } from "./milestone-types"
import type { BoardWriter } from "./use-milestone-board"

interface Props {
  board: MilestoneBoard
  write: BoardWriter
  announce: Announce
}

/** Pure: "1,200,000" / "１２００" / "" → number | null; undefined when not a number. */
export function parseYen(raw: string): number | null | undefined {
  const s = raw.normalize("NFKC").replace(/[,\s円¥]/g, "")
  if (s === "") return null
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

/** 予算 tab: 予算 / 実績 per line, saved when a cell is left; variance and totals. */
export function BudgetSection({ board, write, announce }: Props) {
  const { t, language } = useLanguage()
  const confirm = useConfirm()
  const locale = DATE_LOCALE[language]
  const canEdit = board.permissions.canEdit
  const b = board.summary.budget
  const yen = (v: number | null) => (v === null ? t.msNone : formatYen(v, locale))

  async function run(path: string, init: Parameters<BoardWriter>[1]): Promise<boolean> {
    const result = await write(path, init)
    announce(result.ok ? t.msSaved : result.message, result.ok ? "success" : "error")
    return result.ok
  }

  async function remove(line: BudgetLine) {
    if (await confirm({ message: fillTemplate(t.msDeleteConfirm, { name: line.name }), confirmLabel: t.delete, cancelLabel: t.cancel, variant: "danger" })) await run(`/budget/${line.id}`, { method: "DELETE" })
  }

  return (
    <div className="space-y-3">
      {board.budgetLines.length === 0 ? (
        <p className="text-caption text-fg-muted">{t.msBudgetNone}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-body">
            <thead>
              <tr className="border-b border-border text-left text-caption text-fg-muted">
                <th scope="col" className="py-2 pr-2 font-medium">{t.msBudgetLine}</th>
                <th scope="col" className="w-36 px-2 py-2 text-right font-medium">{t.msBudgetPlanned}</th>
                <th scope="col" className="w-36 px-2 py-2 text-right font-medium">{t.msBudgetActual}</th>
                <th scope="col" className="w-36 px-2 py-2 text-right font-medium">{t.msBudgetVariance}</th>
                {canEdit && <th scope="col" className="w-10"><span className="sr-only">{t.delete}</span></th>}
              </tr>
            </thead>
            <tbody>
              {board.budgetLines.map((line) => (
                <BudgetRow key={line.id} line={line} canEdit={canEdit} yen={yen} onSave={(body) => run(`/budget/${line.id}`, { method: "PATCH", json: body })} onDelete={() => void remove(line)} />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-bold">
                <th scope="row" className="py-2 pr-2 text-left">{t.msBudgetTotal}</th>
                <td className="px-2 py-2 text-right tabular-nums">{yen(b.planned)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{yen(b.actual)}</td>
                <td className={cn("px-2 py-2 text-right tabular-nums", b.variance !== null && b.variance > 0 && "text-danger-strong")}>{yen(b.variance)}</td>
                {canEdit && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {canEdit && <AddLine onAdd={(name) => run("/budget", { method: "POST", json: { name } })} />}
    </div>
  )
}

interface RowProps {
  line: BudgetLine
  canEdit: boolean
  yen: (v: number | null) => string
  onSave: (body: Record<string, unknown>) => Promise<boolean>
  onDelete: () => void
}

function BudgetRow({ line, canEdit, yen, onSave, onDelete }: RowProps) {
  const { t } = useLanguage()
  const variance = line.plannedYen !== null && line.actualYen !== null ? line.actualYen - line.plannedYen : null
  return (
    <tr className="border-b border-border">
      <th scope="row" className="py-1.5 pr-2 text-left font-normal">{line.name}</th>
      {(["plannedYen", "actualYen"] as const).map((key) => (
        <td key={key} className="px-2 py-1.5 text-right tabular-nums">
          {canEdit ? <AmountInput label={`${key === "plannedYen" ? t.msBudgetPlanned : t.msBudgetActual}（${line.name}）`} value={line[key]} onCommit={(v) => onSave({ [key]: v })} /> : yen(line[key])}
        </td>
      ))}
      <td className={cn("px-2 py-1.5 text-right tabular-nums", variance !== null && variance > 0 && "font-semibold text-danger-strong")}>{yen(variance)}</td>
      {canEdit && (
        <td className="py-1.5 text-right">
          <IconButton size="sm" variant="danger" label={fillTemplate(t.msBudgetDelete, { name: line.name })} icon={<Trash2 className="h-4 w-4" />} onClick={onDelete} />
        </td>
      )}
    </tr>
  )
}

function AmountInput({ label, value, onCommit }: { label: string; value: number | null; onCommit: (v: number | null) => Promise<boolean> }) {
  const { t } = useLanguage()
  const [text, setText] = useState(value === null ? "" : String(value))
  const [invalid, setInvalid] = useState(false)
  // Follow the server value after a refetch (e.g. another field saved).
  const [synced, setSynced] = useState(value)
  if (synced !== value) {
    setSynced(value)
    setText(value === null ? "" : String(value))
  }

  function commit() {
    const parsed = parseYen(text)
    setInvalid(parsed === undefined)
    if (parsed === undefined || parsed === value) return
    void onCommit(parsed)
  }

  return (
    <Field label={label} hideLabel error={invalid ? t.msBudgetInvalid : undefined}>
      <Input inputMode="numeric" value={text} className="text-right tabular-nums" onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} />
    </Field>
  )
}

function AddLine({ onAdd }: { onAdd: (name: string) => Promise<boolean> }) {
  const { t } = useLanguage()
  const [name, setName] = useState("")
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault()
        if (name.trim() && (await onAdd(name.trim()))) setName("")
      }}
    >
      <Field label={t.msBudgetLine} className="flex-1 sm:max-w-sm">
        <Input value={name} maxLength={MS_NAME_MAX} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Button type="submit" variant="secondary" leftIcon={<Plus className="h-4 w-4" />} disabled={!name.trim()}>
        {t.msBudgetAdd}
      </Button>
    </form>
  )
}
