"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { Input, cn } from "@/components/ui"
import { diffDays, isYmd } from "../lib/date"
import { durationOf, endFromDuration, endKeepingDuration, snapStart } from "../lib/duration"
import type { PlanItem, Ymd } from "../lib/plan-types"
import { fillTemplate } from "../lib/template"
import type { ChartEnv } from "./chart-types"
import { PlanDateField } from "./plan-date-field"

export type InlineColumn = "start" | "end" | "duration"

interface Props {
  column: InlineColumn
  item: PlanItem
  env: ChartEnv
  /** Persist both planned dates (the row's PATCH). */
  onCommit: (item: PlanItem, start: Ymd, end: Ymd) => void
  /** Reject an impossible entry (end before start). */
  onInvalid: () => void
  className: string
  width: number
  /** Tooltip of the cell (the full date). */
  title?: string
  /** The read-only content of the cell. */
  children: ReactNode
}

/** The new planned dates an inline entry implies, or null when it is not a change / not valid. */
function nextDates(column: InlineColumn, item: PlanItem, raw: string, business: boolean, onInvalid: () => void): { start: Ymd; end: Ymd } | null {
  const start = item.plannedStart
  const end = item.plannedEnd
  if (column === "duration") {
    const n = Number(raw)
    if (!start || !Number.isFinite(n) || n < 1) return null
    const next = endFromDuration(start, n, business)
    return next === end ? null : { start, end: next }
  }
  if (!isYmd(raw)) return null
  if (!start || !end) {
    // Undated row: the first date sets both ends (one day, or the template's 目安期間).
    return column === "start" ? { start: raw, end: endFromDuration(raw, item.durationDays ?? 1, business) } : null
  }
  if (item.isMilestone) return raw === end ? null : { start: raw, end: raw }
  if (column === "start") {
    const snapped = snapStart(raw, business)
    return snapped === start ? null : { start: snapped, end: endKeepingDuration(start, end, snapped, business) }
  }
  if (diffDays(start, raw) < 0) {
    onInvalid()
    return null
  }
  return raw === end ? null : { start, end: raw }
}

/**
 * A grid date cell that edits in place (click → type → Enter): start / end
 * take the date short-hand, duration takes a number (calendar or business days
 * per the page setting). Esc cancels; an unreadable entry is dropped.
 */
export function PlanInlineDateCell({ column, item, env, onCommit, onInvalid, className, width, title, children }: Props) {
  const { t } = env
  const [editing, setEditing] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const wasEditing = useRef(false)
  // Hand the focus back to the cell after an edit so keyboard users keep their place.
  useEffect(() => {
    if (wasEditing.current && !editing) buttonRef.current?.focus()
    wasEditing.current = editing
  }, [editing])
  const label = fillTemplate(
    !item.plannedStart ? t.pscEditUndated : column === "start" ? t.pscEditStart : column === "end" ? t.pscEditEnd : t.pscEditDuration,
    { name: env.nameOf(item) },
  )

  function commit(raw: string) {
    const next = nextDates(column, item, raw, env.businessDays, onInvalid)
    if (next) onCommit(item, next.start, next.end)
  }

  if (!editing) {
    return (
      <div role="cell" className={cn(className, "p-0")} style={{ width }} title={title}>
        <button
          ref={buttonRef}
          type="button"
          tabIndex={-1}
          data-plan-inline={column}
          aria-label={label}
          className={cn(
            "flex h-full w-full items-center gap-1 overflow-hidden whitespace-nowrap rounded-ui-sm px-2 text-left hover:bg-primary-soft/60 focus-visible:bg-primary-soft/60",
            column === "duration" && "justify-end",
          )}
          onClick={() => setEditing(true)}
        >
          {children}
        </button>
      </div>
    )
  }

  return (
    <div role="cell" className={cn(className, "px-1")} style={{ width }}>
      {column === "duration" ? (
        <DurationInput item={item} business={env.businessDays} label={label} onDone={() => setEditing(false)} onCommit={commit} />
      ) : (
        <PlanDateField
          value={column === "start" ? (item.plannedStart ?? "") : (item.plannedEnd ?? "")}
          today={env.today}
          inline={{ onDone: () => setEditing(false), label }}
          onChange={commit}
        />
      )}
    </div>
  )
}

interface DurationProps {
  item: PlanItem
  business: boolean
  label: string
  onDone: () => void
  onCommit: (raw: string) => void
}

function DurationInput({ item, business, label, onDone, onCommit }: DurationProps) {
  const initial = item.plannedStart && item.plannedEnd ? String(durationOf(item.plannedStart, item.plannedEnd, business)) : ""
  const [draft, setDraft] = useState(initial)
  const [finished, setFinished] = useState(false)

  function finish(save: boolean) {
    if (finished) return
    setFinished(true)
    // Leaving the cell untouched must not rewrite the dates (a weekend end would snap in business mode).
    if (save && draft !== initial) onCommit(draft)
    onDone()
  }

  return (
    <Input
      type="number"
      min={1}
      max={3650}
      inputSize="sm"
      className="min-h-7 w-full px-1.5 py-0 text-right tabular-nums"
      aria-label={label}
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          finish(true)
        } else if (e.key === "Escape") {
          e.stopPropagation()
          finish(false)
        }
      }}
    />
  )
}
