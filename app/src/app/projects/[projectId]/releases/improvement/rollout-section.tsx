"use client"

import { useId, useState } from "react"
import { ArrowDown, ArrowUp, Network, Plus, X } from "lucide-react"
import { Button, IconButton, Input, cn } from "@/components/ui"
import { ROLLOUT_NAME_MAX, ROLLOUT_STATUSES } from "@/lib/improvement/constants"
import { rolloutStatusLabel } from "@/lib/improvement/labels"
import { useLanguage } from "@/lib/language-context"
import type { ImprovementItem, ImprovementRollout } from "./improvement-types"
import { SectionFrame, type Announce } from "./section-frame"
import type { BoardWriter } from "./use-improvement-board"

interface Props {
  item: ImprovementItem
  /** PO: add / remove / reorder targets. */
  canManage: boolean
  /** Members: change a target's status. */
  canTrack: boolean
  suggestions: readonly string[]
  write: BoardWriter
  announce: Announce
}

const STATUS_ON: Record<string, string> = {
  todo: "border-border-strong bg-surface-sunken text-fg",
  doing: "border-warning bg-warning-soft text-warning-strong",
  done: "border-success bg-success-soft text-success-strong",
}

/** 横展開: targets (free text with suggestions from the project) and their status chips. */
export function RolloutSection({ item, canManage, canTrack, suggestions, write, announce }: Props) {
  const { t } = useLanguage()
  const done = item.rollouts.filter((r) => r.status === "done").length

  async function run(path: string, init: Parameters<BoardWriter>[2]) {
    const result = await write(item.id, path, init)
    announce(result.ok ? t.kzSaved : result.message, result.ok ? "success" : "error")
    return result.ok
  }

  function move(index: number, delta: number) {
    const ids = item.rollouts.map((r) => r.id)
    const target = index + delta
    if (target < 0 || target >= ids.length) return
    const next = ids.map((id, i) => (i === index ? ids[target] : i === target ? ids[index] : id))
    void run("/rollouts/reorder", { method: "PUT", json: { orderedIds: next } })
  }

  return (
    <SectionFrame
      title={t.kzSectionRollout}
      icon={<Network aria-hidden="true" className="h-5 w-5 text-primary" />}
      aside={item.rollouts.length > 0 ? <span className="text-caption font-semibold text-fg-muted">{done}/{item.rollouts.length}</span> : undefined}
    >
      {item.rollouts.length === 0 ? (
        <p className="text-caption text-fg-muted">{t.kzRolloutNone}</p>
      ) : (
        <ul className="divide-y divide-border">
          {item.rollouts.map((r, i) => (
            <RolloutRow
              key={r.id}
              rollout={r}
              isFirst={i === 0}
              isLast={i === item.rollouts.length - 1}
              canManage={canManage}
              canTrack={canTrack}
              onStatus={(status) => void run(`/rollouts/${r.id}`, { method: "PATCH", json: { status } })}
              onRemove={() => void run(`/rollouts/${r.id}`, { method: "DELETE" })}
              onMove={(delta) => move(i, delta)}
            />
          ))}
        </ul>
      )}
      {canManage && <AddRollout suggestions={suggestions} onAdd={(targetName) => run("/rollouts", { method: "POST", json: { targetName } })} />}
    </SectionFrame>
  )
}

interface RowProps {
  rollout: ImprovementRollout
  isFirst: boolean
  isLast: boolean
  canManage: boolean
  canTrack: boolean
  onStatus: (status: string) => void
  onRemove: () => void
  onMove: (delta: number) => void
}

function RolloutRow({ rollout, isFirst, isLast, canManage, canTrack, onStatus, onRemove, onMove }: RowProps) {
  const { t } = useLanguage()
  const name = rollout.targetName
  return (
    <li className="flex flex-wrap items-center gap-2 py-2">
      <span className="min-w-0 flex-1 basis-32 break-words text-body font-medium text-fg">{name}</span>
      <div role="group" aria-label={t.kzRolloutStatusOf.replace("{name}", name)} className="flex gap-1">
        {ROLLOUT_STATUSES.map((s) => {
          const on = rollout.status === s
          return (
            <button
              key={s}
              type="button"
              aria-pressed={on}
              disabled={!canTrack}
              onClick={() => !on && onStatus(s)}
              className={cn(
                "min-h-9 rounded-full border px-2.5 text-caption font-medium transition-colors disabled:cursor-not-allowed",
                on ? STATUS_ON[s] : "border-border bg-surface text-fg-muted hover:border-border-strong hover:text-fg",
              )}
            >
              {rolloutStatusLabel(s, t)}
            </button>
          )
        })}
      </div>
      {canManage && (
        <div className="flex">
          <IconButton size="sm" label={t.kzRolloutMoveUp.replace("{name}", name)} icon={<ArrowUp className="h-4 w-4" />} disabled={isFirst} onClick={() => onMove(-1)} />
          <IconButton size="sm" label={t.kzRolloutMoveDown.replace("{name}", name)} icon={<ArrowDown className="h-4 w-4" />} disabled={isLast} onClick={() => onMove(1)} />
          <IconButton size="sm" label={t.kzRolloutRemove.replace("{name}", name)} icon={<X className="h-4 w-4" />} onClick={onRemove} />
        </div>
      )}
    </li>
  )
}

function AddRollout({ suggestions, onAdd }: { suggestions: readonly string[]; onAdd: (name: string) => Promise<boolean> }) {
  const { t } = useLanguage()
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)
  const listId = useId()
  const inputId = useId()

  async function submit(e: { preventDefault: () => void }) {
    e.preventDefault()
    const value = name.trim()
    if (!value || saving) return
    setSaving(true)
    if (await onAdd(value)) setName("")
    setSaving(false)
  }

  return (
    // Not a nested <form>: the dialog's form owns submit; Enter in this input is handled here.
    <div className="mt-3 flex items-end gap-2">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <label htmlFor={inputId} className="text-body font-medium text-fg">{t.kzRolloutTarget}</label>
        <Input
          id={inputId}
          list={listId}
          value={name}
          maxLength={ROLLOUT_NAME_MAX}
          placeholder={t.kzRolloutPlaceholder}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) void submit(e)
          }}
        />
        <datalist id={listId}>
          {suggestions.map((s) => <option key={s} value={s} />)}
        </datalist>
      </div>
      <Button variant="secondary" leftIcon={<Plus className="h-4 w-4" />} loading={saving} disabled={!name.trim()} onClick={(e) => void submit(e)}>
        {t.kzRolloutAdd}
      </Button>
    </div>
  )
}
