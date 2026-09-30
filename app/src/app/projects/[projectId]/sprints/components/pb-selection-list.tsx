"use client"

import { useId } from "react"
import { useLanguage } from "@/lib/language-context"
import { pickText } from "@/lib/translation/pick-text"
import { EmptyState, IconButton, cn } from "@/components/ui"
import type { ReadyPbItem } from "./types"
import { ClipboardList, Eye } from "lucide-react"

interface Props {
  items: ReadyPbItem[]
  selectedIds: ReadonlySet<string>
  capacity: number
  onToggle: (id: string) => void
  onViewPbi: (pbiId: string) => void
}

const WARN_RATIO = 0.8

/** Ready-PB checklist with a live "selected workload / capacity" meter. */
export default function PbSelectionList({ items, selectedIds, capacity, onToggle, onViewPbi }: Props) {
  const { t, language } = useLanguage()
  const labelId = useId()
  const selectedWorkload = items
    .filter((item) => selectedIds.has(item.id))
    .reduce((sum, item) => sum + item.workloadScore, 0)
  const isOver = selectedWorkload > capacity
  const barColor = isOver ? "bg-danger" : selectedWorkload > capacity * WARN_RATIO ? "bg-warning" : "bg-success"

  return (
    <div role="group" aria-labelledby={labelId}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <span id={labelId} className="flex items-center gap-1.5 text-body font-medium text-fg">
          <ClipboardList className="w-4 h-4 text-fg-subtle" /> {t.sprintPbImport}
        </span>
        <span className="text-body text-fg-muted" aria-live="polite">
          {t.sprintSelectedWorkload}:{" "}
          <strong className={isOver ? "text-danger" : "text-primary"}>{selectedWorkload}</strong> / {capacity}
        </span>
      </div>
      {capacity > 0 && (
        <div className="w-full bg-surface-sunken rounded-full h-2.5 mb-3 overflow-hidden" aria-hidden="true">
          <div className={cn("h-2.5 rounded-full transition-transform duration-300 origin-left", barColor)}
            style={{ transform: `scaleX(${Math.min(selectedWorkload / capacity, 1)})` }} />
        </div>
      )}
      <div className="border border-border rounded-ui-sm max-h-48 overflow-y-auto">
        {items.length === 0 ? (
          <EmptyState compact title={t.sprintNoPbReady} description={t.sprintNoPbReadyHint} icon={<ClipboardList className="w-6 h-6" />} headingLevel={3} />
        ) : (
          <ul>
            {items.map((item) => {
              const checked = selectedIds.has(item.id)
              const label =
                pickText(item.i18n, "initiative", item.initiative, language).text ||
                pickText(item.i18n, "userStory", item.userStory, language).text ||
                t.sprintNotEntered
              return (
                <li key={item.id}
                  className={cn("flex items-center gap-3 px-3 py-1.5 border-b border-border last:border-0 hover:bg-primary-soft/40", checked && "bg-primary-soft/60")}>
                  <label className="flex items-center gap-3 flex-1 min-w-0 min-h-8 cursor-pointer">
                    <input type="checkbox" checked={checked} onChange={() => onToggle(item.id)}
                      className="h-4 w-4 rounded border-border-strong accent-primary" />
                    <span className="text-caption font-mono text-fg-muted">#{item.displayId}</span>
                    <span className="flex-1 text-body text-fg truncate" title={label}>{label}</span>
                    <span className="text-caption font-medium bg-warning-soft text-warning-strong border border-warning/30 px-2 py-0.5 rounded-full">
                      {item.workloadScore}
                    </span>
                  </label>
                  <IconButton size="sm" label={`${t.view}: #${item.displayId}`} icon={<Eye className="w-4 h-4" />}
                    onClick={() => onViewPbi(item.id)} />
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
