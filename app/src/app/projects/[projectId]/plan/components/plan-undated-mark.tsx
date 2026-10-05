"use client"

import { memo, type KeyboardEvent } from "react"
import { CalendarPlus } from "lucide-react"
import { cn } from "@/components/ui"
import { ROW_LAYOUT, dayCenterX } from "../lib/geometry"
import type { PlanItem } from "../lib/plan-types"
import { fillTemplate } from "../lib/template"
import type { ChartEnv } from "./chart-types"

interface Props {
  item: PlanItem
  env: ChartEnv
  /** A parent's span comes from its children: it cannot be dated directly. */
  derived: boolean
  selected: boolean
  isTabStop: boolean
  hintId: string
  onSelect: (id: string) => void
  onOpen: (item: PlanItem) => void
  onNavigate: (e: KeyboardEvent<HTMLElement>) => boolean
}

/**
 * Timeline mark of an undated row (日程未定): no bar, a chip at the today
 * column instead. It joins the bars' roving focus (data-plan-bar); click /
 * Enter opens the editor, where editors set the dates (parents: derived).
 */
export const PlanUndatedMark = memo(function PlanUndatedMark({ item, env, derived, selected, isTabStop, hintId, onSelect, onOpen, onNavigate }: Props) {
  const { t } = env
  const canSetDates = env.canEdit && !derived
  const label = fillTemplate(canSetDates ? t.tplUndatedBarLabelEdit : t.tplUndatedBarLabel, { name: env.nameOf(item) })
  const left = Math.max(4, dayCenterX(env.today, env.startDay, env.dayWidth) + 6)
  if (env.printing) {
    return (
      <span className="absolute text-caption text-fg-muted" style={{ left, top: ROW_LAYOUT.bar.top }}>
        {t.tplUndated}
      </span>
    )
  }
  return (
    <button
      type="button"
      data-plan-bar={item.id}
      data-plan-undated=""
      tabIndex={isTabStop ? 0 : -1}
      aria-label={label}
      aria-describedby={hintId}
      aria-current={selected ? "true" : undefined}
      title={label}
      onFocus={() => onSelect(item.id)}
      onClick={() => {
        onSelect(item.id)
        onOpen(item)
      }}
      onKeyDown={(e) => {
        if (onNavigate(e)) return
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onOpen(item)
        }
      }}
      className={cn(
        "absolute z-[6] inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full border border-dashed border-border-strong bg-surface px-2 text-caption text-fg-muted shadow-ui-sm hover:border-primary hover:text-primary",
        selected && "ring-2 ring-focus ring-offset-1 ring-offset-surface",
      )}
      style={{ left, top: ROW_LAYOUT.bar.top - 4 }}
    >
      {canSetDates && <CalendarPlus aria-hidden="true" className="h-3.5 w-3.5" />}
      {t.tplUndated}
    </button>
  )
})
