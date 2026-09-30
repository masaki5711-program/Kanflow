"use client"

import { ChevronLeft, ChevronRight, Plus } from "lucide-react"
import { Button, IconButton, cn } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import type { ViewMode } from "./calendar-types"

export interface CalendarHeaderProps {
  periodLabel: string
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onAddEvent: () => void
}

export default function CalendarHeader({
  periodLabel,
  viewMode,
  onViewModeChange,
  onPrev,
  onNext,
  onToday,
  onAddEvent,
}: CalendarHeaderProps) {
  const { t } = useLanguage()
  const viewModes: { key: ViewMode; label: string }[] = [
    { key: "month", label: t.calendarMonthView },
    { key: "week", label: t.calendarWeekView },
    { key: "team", label: t.calendarTeamView },
  ]

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 bg-surface border-b border-border shadow-ui-sm shrink-0">
      <div className="flex items-center gap-2">
        <IconButton label={t.calendarPrev} icon={<ChevronLeft className="h-4 w-4" />} size="sm" onClick={onPrev} />
        <h2 className="text-title font-bold text-fg min-w-[200px] text-center" aria-live="polite">
          {periodLabel}
        </h2>
        <IconButton label={t.calendarNext} icon={<ChevronRight className="h-4 w-4" />} size="sm" onClick={onNext} />
      </div>

      <div className="flex bg-surface-sunken rounded-ui-md p-1 gap-0.5" role="group" aria-label={t.calendarViewModeLabel}>
        {viewModes.map((vm) => (
          <button
            key={vm.key}
            type="button"
            aria-pressed={viewMode === vm.key}
            onClick={() => onViewModeChange(vm.key)}
            className={cn(
              "px-4 py-1.5 text-caption font-semibold rounded-ui-sm",
              viewMode === vm.key
                ? "bg-primary text-primary-fg shadow-ui-sm"
                : "text-fg-muted hover:text-fg hover:bg-surface-muted",
            )}
          >
            {vm.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2.5">
        <Button variant="secondary" onClick={onToday}>
          {t.calendarToday}
        </Button>
        <Button leftIcon={<Plus className="h-4 w-4" />} onClick={onAddEvent}>
          {t.eventAdd}
        </Button>
      </div>
    </div>
  )
}
