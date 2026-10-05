"use client"

import { CalendarRange, Crosshair, Diamond, LayoutTemplate, Maximize2, Plus } from "lucide-react"
import { CardMenu, type CardMenuItem } from "@/app/projects/[projectId]/backlog/card-menu"
import { Button, PageHeader, cn } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { PLAN_ZOOMS, type PlanZoom } from "../lib/scale"

interface Props {
  zoom: PlanZoom
  onZoom: (z: PlanZoom) => void
  onJumpToday: () => void
  /** "Show everything": zoom + scroll so all live items and today are in view. */
  onFitAll: () => void
  fitDisabled?: boolean
  canEdit: boolean
  onAddItem: () => void
  onAddMilestone: () => void
  onSaveBaseline: () => void
  onClearBaseline: () => void
  hasBaseline: boolean
  exportUrl: string
  onPrint: () => void
  /** Plan templates: load / save the plan as one / 仮置き of the undated items (editors). */
  onLoadTemplate: () => void
  onSaveAsTemplate: () => void
  onScheduleUndated: () => void
  hasItems: boolean
  hasUndated: boolean
}

/** Page header (h1) with zoom switch, today jump, "show everything", add actions and a "more" menu. */
export function PlanToolbar(props: Props) {
  const { t } = useLanguage()
  const zoomLabel: Record<PlanZoom, string> = {
    day: t.planZoomDay,
    week: t.planZoomWeek,
    month: t.planZoomMonth,
    quarter: t.planZoomQuarter,
  }
  const more: CardMenuItem[] = [
    ...(props.canEdit
      ? [
          { key: "baseline", label: t.planBaselineSave, onSelect: props.onSaveBaseline },
          { key: "clear", label: t.planBaselineClear, disabled: !props.hasBaseline, onSelect: props.onClearBaseline },
          { key: "tpl-save", label: t.tplSaveAsButton, disabled: !props.hasItems, onSelect: props.onSaveAsTemplate },
          { key: "tpl-schedule", label: t.tplScheduleTitle, disabled: !props.hasUndated, onSelect: props.onScheduleUndated },
        ]
      : []),
    { key: "export", label: t.planExport, onSelect: () => window.location.assign(props.exportUrl) },
    { key: "print", label: t.planPrint, onSelect: props.onPrint },
  ]

  return (
    <PageHeader
      className="mb-0"
      title={t.planTitle}
      description={t.planDesc}
      icon={
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-ui-md bg-primary-soft text-primary-strong">
          <CalendarRange className="h-5 w-5" />
        </span>
      }
      actions={
        <div data-plan-print-hide="" className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label={t.planZoomLabel} className="inline-flex rounded-ui-sm border border-border-strong bg-surface p-0.5">
            {PLAN_ZOOMS.map((z) => (
              <button
                key={z}
                type="button"
                aria-pressed={props.zoom === z}
                onClick={() => props.onZoom(z)}
                className={cn(
                  "min-h-8 rounded-[6px] px-2.5 text-body",
                  props.zoom === z ? "bg-primary font-medium text-primary-fg" : "text-fg-muted hover:bg-surface-sunken hover:text-fg",
                )}
              >
                {zoomLabel[z]}
              </button>
            ))}
          </div>
          <Button variant="secondary" size="sm" leftIcon={<Crosshair className="h-4 w-4" />} onClick={props.onJumpToday}>
            {t.planTodayJump}
          </Button>
          <Button variant="secondary" size="sm" leftIcon={<Maximize2 className="h-4 w-4" />} onClick={props.onFitAll} disabled={props.fitDisabled}>
            {t.planFitAll}
          </Button>
          {props.canEdit && (
            <>
              <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={props.onAddItem}>
                {t.planAddItem}
              </Button>
              <Button variant="secondary" size="sm" leftIcon={<Diamond className="h-4 w-4 text-plan-milestone" />} onClick={props.onAddMilestone}>
                {t.planAddMilestone}
              </Button>
              <Button variant="secondary" size="sm" leftIcon={<LayoutTemplate className="h-4 w-4" />} onClick={props.onLoadTemplate} data-testid="plan-load-template">
                {t.tplLoadButton}
              </Button>
            </>
          )}
          <CardMenu label={t.planMoreActions} items={more} />
        </div>
      }
    />
  )
}
