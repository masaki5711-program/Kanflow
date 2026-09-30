"use client"

import { useEffect, useId, useRef, useState } from "react"
import { ChevronsDownUp, ChevronsUpDown, Columns3, Search, X } from "lucide-react"
import { Button, Input, Select, cn } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { EMPTY_FILTER, OWNER_NONE, isFilterActive, type PlanFilter } from "../lib/filter"
import { SCHEDULE_STATES } from "../lib/plan-types"
import { PLAN_COLUMNS, type PhoneLayout, type PlanColumn } from "../lib/prefs"
import { scheduleLabel } from "../lib/status"

interface Props {
  filter: PlanFilter
  onFilter: (f: PlanFilter) => void
  owners: readonly { id: string; name: string }[]
  /** Visible grid columns. */
  shownColumns: readonly PlanColumn[]
  /** Chosen columns the chart box is too narrow for (marked in the column menu). */
  hiddenColumns: readonly PlanColumn[]
  onToggleColumn: (c: PlanColumn) => void
  /** Phones: the current names-first / timeline-first choice (null = not a phone, no toggle). */
  phoneLayout: PhoneLayout | null
  onPhoneLayout: (v: PhoneLayout) => void
  columnsDisabled: boolean
  onExpandAll: () => void
  onCollapseAll: () => void
  shown: number
  total: number
}

/** Column visibility popover (checkbox list). */
function ColumnsMenu({ shown, hidden, onToggle, disabled }: { shown: readonly PlanColumn[]; hidden: readonly PlanColumn[]; onToggle: (c: PlanColumn) => void; disabled: boolean }) {
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
    period: t.planColPeriod,
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
              <input type="checkbox" className="h-4 w-4" checked={shown.includes(c)} onChange={() => onToggle(c)} aria-describedby={hidden.includes(c) ? `${id}-${c}` : undefined} />
              <span className="flex min-w-0 flex-col leading-tight">
                {labels[c]}
                {hidden.includes(c) && (
                  <span id={`${id}-${c}`} aria-hidden="true" data-plan-column-hidden={c} className="text-caption text-fg-muted">
                    {t.planColumnHiddenNarrow}
                  </span>
                )}
              </span>
            </label>
          ))}
        </fieldset>
      )}
    </div>
  )
}

/** Phones: names first (wide name column, timeline peek) or timeline first (the splitter layout). */
function PhoneLayoutToggle({ value, onChange }: { value: PhoneLayout; onChange: (v: PhoneLayout) => void }) {
  const { t } = useLanguage()
  const options: [PhoneLayout, string][] = [
    ["names", t.planPhoneNamesFirst],
    ["timeline", t.planPhoneTimelineFirst],
  ]
  return (
    <div role="group" aria-label={t.planPhoneLayoutLabel} data-plan-phone-layout="" className="inline-flex rounded-ui-md border border-border bg-surface-muted p-0.5">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "min-h-8 rounded-ui-sm px-2.5 text-caption font-semibold focus-visible:outline-2 focus-visible:outline-focus",
            value === v ? "bg-surface text-fg shadow-ui-sm" : "text-fg-muted hover:text-fg",
          )}
        >
          {label}
        </button>
      ))}
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
      <label className="flex shrink-0 items-center gap-1.5 text-caption text-fg-muted">
        <span className="shrink-0 whitespace-nowrap">{t.planFilterState}</span>
        <Select selectSize="sm" value={filter.state} onChange={(e) => onFilter({ ...filter, state: e.target.value as PlanFilter["state"] })}>
          <option value="">{t.planFilterAll}</option>
          {states.map((s) => (
            <option key={s} value={s}>
              {scheduleLabel(t, s)}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex shrink-0 items-center gap-1.5 text-caption text-fg-muted">
        <span className="shrink-0 whitespace-nowrap">{t.planFilterOwner}</span>
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
        <ColumnsMenu shown={props.shownColumns} hidden={props.hiddenColumns} onToggle={props.onToggleColumn} disabled={props.columnsDisabled} />
        {props.phoneLayout && <PhoneLayoutToggle value={props.phoneLayout} onChange={props.onPhoneLayout} />}
      </div>
    </div>
  )
}
