"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { Button, Field, Input, cn } from "@/components/ui"
import { MS_NAME_MAX } from "@/lib/milestones/constants"
import { useLanguage } from "@/lib/language-context"
import { filterPunch, type PunchFilter, type PunchItem } from "./milestone-types"
import { PunchRow, type PunchRowContext } from "./punch-row"

interface Props {
  items: readonly PunchItem[]
  ctx: PunchRowContext
  viewerId: string
  /** Quick-added items belong to this stage (the stage panel). */
  planItemId?: string
  /** Show the filter chips (the board tab; the stage panel lists everything). */
  filters?: boolean
}

const FILTERS: readonly PunchFilter[] = ["open", "overdue", "mine", "all"]

/** 残課題: quick add (type + Enter), filter chips, the rows. */
export function PunchSection({ items, ctx, viewerId, planItemId, filters = true }: Props) {
  const { t } = useLanguage()
  const [filter, setFilter] = useState<PunchFilter>(filters ? "open" : "all")
  const shown = filterPunch(items, filter, ctx.todayKey, viewerId)
  const labels: Record<PunchFilter, string> = { open: t.msFilterOpen, overdue: t.msFilterOverdue, mine: t.msFilterMine, all: t.msFilterAll }
  return (
    <div className="space-y-3">
      {ctx.canTrack && <QuickAdd ctx={ctx} planItemId={planItemId} />}
      {filters && (
        <div role="group" aria-label={t.msPunchFilter} className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                "min-h-9 rounded-full border px-3 text-caption font-medium transition-colors",
                filter === f ? "border-primary bg-primary text-primary-fg" : "border-border bg-surface text-fg-muted hover:border-primary hover:text-primary-strong",
              )}
            >
              {labels[f]}
              <span className="ml-1 tabular-nums">{filterPunch(items, f, ctx.todayKey, viewerId).length}</span>
            </button>
          ))}
        </div>
      )}
      {shown.length === 0 ? (
        <p className="py-2 text-caption text-fg-muted">{t.msPunchNone}</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((p) => (
            <PunchRow key={p.id} item={p} ctx={ctx} />
          ))}
        </ul>
      )}
    </div>
  )
}

function QuickAdd({ ctx, planItemId }: { ctx: PunchRowContext; planItemId?: string }) {
  const { t } = useLanguage()
  const [title, setTitle] = useState("")
  const [saving, setSaving] = useState(false)

  async function add() {
    const value = title.trim()
    if (!value || saving) return
    setSaving(true)
    const result = await ctx.write("/punch", { method: "POST", json: { title: value, planItemId: planItemId ?? null } })
    setSaving(false)
    ctx.announce(result.ok ? t.msPunchAdded : result.message, result.ok ? "success" : "error")
    if (result.ok) setTitle("")
  }

  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        void add()
      }}
    >
      <Field label={t.msPunchTitle} hideLabel className="flex-1">
        <Input value={title} maxLength={MS_NAME_MAX} placeholder={t.msPunchAddPlaceholder} onChange={(e) => setTitle(e.target.value)} data-testid="ms-punch-quick-add" />
      </Field>
      <Button type="submit" leftIcon={<Plus className="h-4 w-4" />} loading={saving} disabled={!title.trim()}>
        {t.msPunchAdd}
      </Button>
    </form>
  )
}
