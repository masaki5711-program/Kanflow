"use client"

import { useState } from "react"
import { CircleCheckBig, Plus } from "lucide-react"
import { Button, Field, Input, useConfirm } from "@/components/ui"
import { fillTemplate } from "@/lib/fill-template"
import { useLanguage } from "@/lib/language-context"
import { MS_NAME_MAX, MS_TEXT_MAX } from "@/lib/milestones/constants"
import type { Announce } from "../improvement/section-frame"
import { CheckRow } from "./check-row"
import { checkLabel, type MilestoneBoard } from "./milestone-types"
import type { BoardWriter } from "./use-milestone-board"

interface Props {
  board: MilestoneBoard
  stageNames: ReadonlyMap<string, string>
  stageOptions: ReadonlyArray<{ id: string; label: string }>
  write: BoardWriter
  announce: Announce
}

/** チェック項目 tab (検収 / テスト / 評価 …): 検収完了 banner, one row per check, add (PO / SM). */
export function ChecksSection({ board, stageNames, stageOptions, write, announce }: Props) {
  const { t } = useLanguage()
  const confirm = useConfirm()
  const label = checkLabel(board, t)
  const { canEdit, canTrack } = board.permissions

  async function run(path: string, init: Parameters<BoardWriter>[1], success: string): Promise<boolean> {
    const result = await write(path, init)
    announce(result.ok ? success : result.message, result.ok ? "success" : "error")
    return result.ok
  }

  async function remove(id: string, name: string) {
    if (await confirm({ message: fillTemplate(t.msDeleteConfirm, { name }), confirmLabel: t.delete, cancelLabel: t.cancel, variant: "danger" })) {
      await run(`/checks/${id}`, { method: "DELETE" }, t.msSaved)
    }
  }

  return (
    <div className="space-y-3">
      {board.summary.checks.complete && (
        <p role="status" className="flex items-center gap-2 rounded-ui-md border border-success/40 bg-success-soft px-3 py-2 text-body font-semibold text-success-strong">
          <CircleCheckBig aria-hidden="true" className="h-5 w-5" />
          {fillTemplate(t.msAcceptedBanner, { label })}
        </p>
      )}
      {board.checks.length === 0 ? (
        <p className="text-caption text-fg-muted">{fillTemplate(t.msChecksNone, { label })}</p>
      ) : (
        <ul className="space-y-2">
          {board.checks.map((c) => (
            <CheckRow
              key={c.id}
              check={c}
              todayKey={board.todayKey}
              stageName={c.planItemId ? (stageNames.get(c.planItemId) ?? null) : null}
              stageOptions={stageOptions}
              canEdit={canEdit}
              canTrack={canTrack}
              onPatch={(body, success) => run(`/checks/${c.id}`, { method: "PATCH", json: body }, success)}
              onDelete={() => void remove(c.id, c.name)}
            />
          ))}
        </ul>
      )}
      {canEdit && <AddCheck onAdd={(name, criterion) => run("/checks", { method: "POST", json: { name, criterion } }, t.msSaved)} />}
    </div>
  )
}

function AddCheck({ onAdd }: { onAdd: (name: string, criterion: string | null) => Promise<boolean> }) {
  const { t } = useLanguage()
  const [name, setName] = useState("")
  const [criterion, setCriterion] = useState("")
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!name.trim() || saving) return
    setSaving(true)
    if (await onAdd(name.trim(), criterion.trim() || null)) {
      setName("")
      setCriterion("")
    }
    setSaving(false)
  }

  return (
    <form
      className="grid gap-2 rounded-ui-md border border-dashed border-border-strong p-3 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <Field label={t.msCheckName}>
        <Input value={name} maxLength={MS_NAME_MAX} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={t.msCheckCriterion}>
        <Input value={criterion} maxLength={MS_TEXT_MAX} onChange={(e) => setCriterion(e.target.value)} />
      </Field>
      <Button type="submit" variant="secondary" leftIcon={<Plus className="h-4 w-4" />} loading={saving} disabled={!name.trim()}>
        {t.msCheckAdd}
      </Button>
    </form>
  )
}
