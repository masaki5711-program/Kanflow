"use client"

import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { Button, IconButton, cn } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { ZOOM_LEVELS, type ZoomLevel } from "./gantt-types"

interface GanttToolbarProps {
  zoom: ZoomLevel
  onZoomChange: (zoom: ZoomLevel) => void
  onScrollToToday: () => void
  sprintCount: number
  taskCount: number
  completionPct: number
  isListOpen: boolean
  onToggleList: () => void
  /** id of the left panel (aria-controls). */
  listId: string
}

export function GanttToolbar({
  zoom,
  onZoomChange,
  onScrollToToday,
  sprintCount,
  taskCount,
  completionPct,
  isListOpen,
  onToggleList,
  listId,
}: GanttToolbarProps) {
  const { t } = useLanguage()
  const zoomLabel: Record<ZoomLevel, string> = {
    week: t.ganttZoomWeek,
    "2weeks": t.ganttZoom2Weeks,
    month: t.ganttZoomMonth,
  }

  return (
    <div className="px-4 py-2.5 border-b border-border bg-surface flex flex-wrap items-center gap-4 shrink-0 shadow-ui-sm">
      <IconButton
        label={isListOpen ? t.ganttHideList : t.ganttShowList}
        icon={isListOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
        variant="secondary"
        size="sm"
        aria-expanded={isListOpen}
        aria-controls={listId}
        onClick={onToggleList}
      />
      <div
        role="group"
        aria-label={t.ganttZoomLabel}
        className="flex items-center rounded-ui-sm border border-border overflow-hidden text-caption font-medium"
      >
        {ZOOM_LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            aria-pressed={zoom === level}
            onClick={() => onZoomChange(level)}
            className={cn(
              "min-h-8 px-3 py-1.5",
              zoom === level ? "bg-primary text-primary-fg" : "bg-surface text-fg-muted hover:bg-surface-muted",
            )}
          >
            {zoomLabel[level]}
          </button>
        ))}
      </div>

      <Button
        variant="secondary"
        size="sm"
        onClick={onScrollToToday}
        leftIcon={<span aria-hidden="true" className="inline-block w-2 h-2 rounded-full bg-danger" />}
      >
        {t.ganttToday}
      </Button>

      <div className="ml-auto flex items-center gap-4 text-caption text-fg-muted">
        <span>{t.ganttSprintCount.replace("{n}", String(sprintCount))}</span>
        <span>{t.ganttTaskCount.replace("{n}", String(taskCount))}</span>
        <span className="flex items-center gap-1.5">
          <span
            role="progressbar"
            aria-label={t.ganttCompletion}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={completionPct}
            className="inline-block w-16 h-1.5 rounded-full bg-surface-sunken overflow-hidden"
          >
            <span className="block h-full rounded-full bg-success" style={{ width: `${completionPct}%` }} />
          </span>
          {completionPct}%
        </span>
      </div>
    </div>
  )
}
