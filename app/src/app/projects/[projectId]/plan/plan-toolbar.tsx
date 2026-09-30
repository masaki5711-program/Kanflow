"use client"

import { Button, cn, PageHeader } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"

export type PlanZoom = "day" | "week" | "month"

interface PlanToolbarProps {
  zoom: PlanZoom
  onZoom: (z: PlanZoom) => void
  onJumpToday: () => void
  canEdit: boolean
  onAddItem: () => void
  onAddMilestone: () => void
}

/** Page header (h1), zoom switch, "today" jump and add actions. */
export function PlanToolbar({ zoom, onZoom, onJumpToday, canEdit, onAddItem, onAddMilestone }: PlanToolbarProps) {
  const { t } = useLanguage()
  const zoomLabel: Record<PlanZoom, string> = { day: t.planZoomDay, week: t.planZoomWeek, month: t.planZoomMonth }
  return (
    <PageHeader
      className="mb-0"
      title={t.planTitle}
      description={t.planDesc}
      icon={
        <span className="inline-flex w-8 h-8 items-center justify-center rounded-ui-md bg-primary-soft text-primary">
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M2 5a2 2 0 012-2h2a2 2 0 012 2v1h2a2 2 0 012 2v1h2a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm2 0v1h2V5H4zm4 3v1h2V8H8zm4 3v6h2v-6h-2z"/>
          </svg>
        </span>
      }
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label={t.planZoomLabel} className="inline-flex rounded-ui-sm border border-border bg-surface p-0.5">
            {(["day", "week", "month"] as const).map((z) => (
              <button
                key={z}
                type="button"
                aria-pressed={zoom === z}
                onClick={() => onZoom(z)}
                className={cn(
                  "min-h-7 px-2.5 rounded-ui-sm text-caption",
                  zoom === z ? "bg-primary text-primary-fg" : "text-fg-muted hover:bg-surface-sunken",
                )}
              >
                {zoomLabel[z]}
              </button>
            ))}
          </div>
          <Button variant="secondary" size="sm" onClick={onJumpToday}>{t.planTodayJump}</Button>
          {canEdit && (
            <>
              <Button size="sm" onClick={onAddItem}>+ {t.planAddItem}</Button>
              <Button variant="secondary" size="sm" leftIcon={<span aria-hidden="true" className="text-violet-600">◆</span>} onClick={onAddMilestone}>
                {t.planAddMilestone}
              </Button>
            </>
          )}
        </div>
      }
    />
  )
}

/** Status colour legend for the timeline bars. */
export function PlanLegend() {
  const { t } = useLanguage()
  const swatches = [
    { key: "not_started", cls: "bg-slate-500", label: t.planStatusNotStarted },
    { key: "in_progress", cls: "bg-blue-700", label: t.planStatusInProgress },
    { key: "on_hold", cls: "bg-amber-700", label: t.planStatusOnHold },
    { key: "delayed", cls: "bg-rose-700", label: t.planStatusDelayed },
    { key: "done", cls: "bg-emerald-700", label: t.planStatusDone },
  ]
  return (
    <ul className="flex flex-wrap items-center gap-3 text-caption text-fg-muted">
      {swatches.map((s) => (
        <li key={s.key} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={`w-3 h-2.5 rounded ${s.cls}`} />{s.label}
        </li>
      ))}
      <li className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="text-violet-600">◆</span>{t.planIsMilestone}
      </li>
      <li className="inline-flex items-center gap-1.5 ml-2">
        <span aria-hidden="true" className="w-3 h-2.5 rounded bg-blue-700 relative overflow-hidden">
          <span className="absolute inset-y-0 left-0 w-1/2 bg-black/25" />
        </span>
        {t.planProgressLegend}
      </li>
    </ul>
  )
}
