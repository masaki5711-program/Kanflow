"use client"

import { useEffect, useId, useRef, useState } from "react"
import { ChevronsDownUp, ChevronsUpDown, Columns3, Search, X } from "lucide-react"
import { Button, Input, Select } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { EMPTY_FILTER, OWNER_NONE, isFilterActive, type PlanFilter } from "../lib/filter"
import { SCHEDULE_STATES } from "../lib/plan-types"
import { PLAN_COLUMNS, type PlanColumn } from "../lib/prefs"
import { scheduleLabel } from "../lib/status"

interface Props {
  filter: PlanFilter
  onFilter: (f: PlanFilter) => void
  owners: readonly { id: string; name: string }[]
  hiddenColumns: readonly PlanColumn[]
  onToggleColumn: (c: PlanColumn) => void
  columnsDisabled: boolean
  onExpandAll: () => void
  onCollapseAll: () => void
  shown: number
  total: number
}

/** Column visibility popover (checkbox list). */
function ColumnsMenu({ hidden, onToggle, disabled }: { hidden: readonly PlanColumn[]; onToggle: (c: PlanColumn) => void; disabled: boolean }) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const id = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])
  const labels: Record<PlanColumn, string> = {
    start: t.planColStart,
    end: t.planColEnd,
    duration: t.planColDuration,
    progress: t.planColProgress,
    owner: t.planColOwner,
    status: t.planColStatus,
  }
  return (
    <div ref={rootRef} className="relative" onKeyDown={(e) => e.key === "Escape" && open && (e.stopPropagation(), setOpen(false))}>
      <Button variant="secondary" size="sm" disabled={disabled} aria-expanded={open} aria-controls={id} leftIcon={<Columns3 className="h-4 w-4" />} onClick={() => setOpen((v) => !v)}>
        {t.planColumnsMenu}
      </Button>
      {open && (
        <fieldset id={id} className="absolute right-0 top-full z-40 mt-1 min-w-44 rounded-ui-md border border-border bg-surface p-2 shadow-ui-md">
          <legend className="sr-only">{t.planColumnsMenu}</legend>
          {PLAN_COLUMNS.map((c) => (
            <label key={c} className="flex min-h-8 cursor-pointer items-center gap-2 rounded-ui-sm px-2 text-body text-fg hover:bg-surface-muted">
              <input type="checkbox" className="h-4 w-4" checked={!hidden.includes(c)} onChange={() => onToggle(c)} />
              {labels[c]}
            </label>
          ))}
        </fieldset>
      )}
    </div>
  )
}

/** Search + state/owner filters, expand/collapse all and column visibility. */
export function PlanFilterBar(props: Props) {
  const { t } = useLanguage()
  const { filter, onFilter } = props
  const active = isFilterActive(filter)
  const states = SCHEDULE_STATES
  return (
    <div data-plan-print-hide="" role="search" className="flex flex-wrap items-end gap-2">
      <label className="relative min-w-48 flex-1 sm:max-w-72">
        <span className="sr-only">{t.planSearch}</span>
        <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
        <Input type="search" inputSize="sm" value={filter.q} placeholder={t.planSearch} onChange={(e) => onFilter({ ...filter, q: e.target.value })} className="pl-8" />
      </label>
      <label className="flex items-center gap-1.5 text-caption text-fg-muted">
        {t.planFilterState}
        <Select selectSize="sm" value={filter.state} onChange={(e) => onFilter({ ...filter, state: e.target.value as PlanFilter["state"] })}>
          <option value="">{t.planFilterAll}</option>
          {states.map((s) => (
            <option key={s} value={s}>
              {scheduleLabel(t, s)}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex items-center gap-1.5 text-caption text-fg-muted">
        {t.planFilterOwner}
        <Select selectSize="sm" value={filter.owner} onChange={(e) => onFilter({ ...filter, owner: e.target.value })}>
          <option value="">{t.planFilterAll}</option>
          <option value={OWNER_NONE}>{t.planOwnerNone}</option>
          {props.owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
      </label>
      {active && (
        <Button variant="ghost" size="sm" leftIcon={<X className="h-4 w-4" />} onClick={() => onFilter(EMPTY_FILTER)}>
          {t.planClearFilters}
        </Button>
      )}
      <span role="status" className="text-caption text-fg-muted tabular-nums">
        {active ? `${props.shown} / ${props.total}` : ""}
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" leftIcon={<ChevronsUpDown className="h-4 w-4" />} onClick={props.onExpandAll}>
          {t.planExpandAll}
        </Button>
        <Button variant="ghost" size="sm" leftIcon={<ChevronsDownUp className="h-4 w-4" />} onClick={props.onCollapseAll}>
          {t.planCollapseAll}
        </Button>
        <ColumnsMenu hidden={props.hiddenColumns} onToggle={props.onToggleColumn} disabled={props.columnsDisabled} />
      </div>
    </div>
  )
}
